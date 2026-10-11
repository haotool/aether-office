import { createHash } from 'node:crypto';
import { open, type FileHandle } from 'node:fs/promises';
import { setTimeout as sleep } from 'node:timers/promises';
import type { CodexLimits, UsageResponse } from '@aether/contracts';
import { readCodexLimits } from '../platform/codex-limits.js';
import { aggregate, WINDOW_DAYS, type Attribution, type Tracked } from './usage-aggregate.js';
import { listTranscripts, parentOf, repoOf, type Transcript } from './usage-files.js';
import { ClaimBook } from './usage-claude.js';
import { newState } from './usage-counters.js';
import { dayKeyOf, parseChunk } from './usage-parse.js';
import { MAX_TRACKED_FILES, keyOf, loadRollup, saveRollup, type Entry } from './usage-store.js';

// The first scan of a long history runs in the background, one file at a time through one shared buffer with a turn of
// the event loop between chunks, so a request never waits for it.

const CHUNK = 1024 * 1024;
const SIG_BYTES = 256;
const sha = (data: Buffer) => createHash('sha1').update(data).digest('hex').slice(0, 12);
/** A pass may take about a tenth of the time (the listing of a big history is the cost), never leaving a gap above this. */
const PASS_DUTY = 10;
const MAX_PASS_GAP_MS = 3000;
const SAVE_GAP_MS = 30_000;
const MEMO_ANSWERS = 6;
const FILE_WINDOW_MS = (WINDOW_DAYS + 1) * 86_400_000;
const tick = () => new Promise<void>((resolve) => setImmediate(resolve));

type UsageOptions = {
  home: string;
  timeZone?: string;
  cacheFile?: string | null;
  now?: () => number;
  maxFiles?: number;
};

type Answer = UsageResponse;
type ScanState = Answer['scan'];

class UsageTracker {
  readonly timeZone: string;
  readonly metrics = { bytesRead: 0, filesRead: 0, passes: 0 };
  private readonly clock: () => number;
  private readonly maxFiles: number;
  private readonly dayOf: (ms: number) => string;
  private readonly buffer = Buffer.allocUnsafe(CHUNK);
  private store: Map<string, Entry> | null = null;
  private listing: Transcript[] = [];
  private pending = 0;
  private running: Promise<void> | null = null;
  private lastPassEnd = 0;
  private passGap = 0;
  private lastSaved = 0;
  private dirty = false;
  private changedAt = 0;
  private limitsMemo: { stamp: string; value: CodexLimits | null } | null = null;
  private readonly memo = new Map<string, Answer>();
  private readonly claims = new ClaimBook();
  private found = 0;
  private truncated = false;
  private failedFiles = 0;

  constructor(private readonly options: UsageOptions) {
    this.timeZone = options.timeZone ?? Intl.DateTimeFormat().resolvedOptions().timeZone;
    this.clock = options.now ?? Date.now;
    this.maxFiles = options.maxFiles ?? MAX_TRACKED_FILES;
    this.dayOf = dayKeyOf(this.timeZone);
  }

  private async tailOf(handle: FileHandle, offset: number): Promise<string> {
    const from = Math.max(0, offset - SIG_BYTES);
    const { bytesRead } = await handle.read(this.buffer, 0, offset - from, from);
    return sha(this.buffer.subarray(0, bytesRead));
  }

  private async entryToRead(
    handle: FileHandle,
    t: Transcript,
    key: string,
    known: Entry | undefined,
  ): Promise<Entry> {
    const { bytesRead: headBytes } = await handle.read(this.buffer, 0, SIG_BYTES, 0);
    const sig = sha(this.buffer.subarray(0, headBytes));
    const appended =
      known !== undefined &&
      known.sig === sig &&
      known.offset <= t.size &&
      (await this.tailOf(handle, known.offset)) === known.tail;
    if (known && appended) return known;
    if (known) this.claims.release(new Set([key]));
    return {
      state: newState(t.provider),
      offset: 0,
      mtime: 0,
      size: 0,
      sig,
      tail: '',
      repo: known?.repo ?? null,
    };
  }

  private async parseRest(handle: FileHandle, t: Transcript, key: string, entry: Entry) {
    let offset = entry.offset;
    while (offset < t.size) {
      const { bytesRead } = await handle.read(
        this.buffer,
        0,
        Math.min(CHUNK, t.size - offset),
        offset,
      );
      if (!bytesRead) break;
      this.metrics.bytesRead += bytesRead;
      const end = this.buffer.lastIndexOf(10, bytesRead - 1);
      if (end < 0) {
        if (bytesRead < CHUNK) break;
        offset += bytesRead;
        continue;
      }
      parseChunk(entry.state, this.buffer.subarray(0, end), this.dayOf, {
        book: this.claims,
        owner: key,
      });
      offset += end + 1;
      await tick();
    }
    return offset;
  }

  /** Reads what `t` gained since the last look into its entry; a rewritten or shortened file is read again from the start. */
  private async read(t: Transcript, entries: Map<string, Entry>) {
    const key = keyOf(t.file);
    const handle = await open(t.file, 'r');
    try {
      const entry = await this.entryToRead(handle, t, key, entries.get(key));
      const offset = await this.parseRest(handle, t, key, entry);
      entries.set(key, {
        ...entry,
        offset,
        mtime: t.mtime,
        size: t.size,
        tail: await this.tailOf(handle, offset),
        repo: entry.repo ?? (await repoOf(t)),
        parent: entry.parent ?? (await parentOf(t)),
      });
      this.metrics.filesRead++;
    } finally {
      await handle.close();
    }
  }

  /** Reads every transcript that changed, oldest first: of a session and its copy (a resume), the original owns the shared messages. */
  private async readStale(entries: Map<string, Entry>) {
    const stale = this.listing
      .filter((t) => {
        const e = entries.get(keyOf(t.file));
        return !e || e.mtime !== t.mtime || e.size !== t.size;
      })
      .sort((a, b) => a.mtime - b.mtime);
    this.pending = stale.length;
    this.failedFiles = 0;
    for (const t of stale) {
      try {
        await this.read(t, entries);
        this.dirty = true;
        this.changedAt = this.clock();
      } catch {
        this.failedFiles++; // vanished or unreadable: skipped, never fatal, but counted
      }
      this.pending--;
    }
  }

  private dropGone(entries: Map<string, Entry>) {
    const keys = new Set(this.listing.map((t) => keyOf(t.file)));
    const gone = new Set([...entries.keys()].filter((key) => !keys.has(key)));
    if (!gone.size) return;
    this.claims.release(gone);
    for (const key of gone) entries.delete(key);
    this.dirty = true;
    this.changedAt = this.clock();
  }

  private async pass() {
    const entries = (this.store ??= this.options.cacheFile
      ? await loadRollup(this.options.cacheFile, this.timeZone)
      : new Map());
    const listed = await listTranscripts(
      this.options.home,
      this.clock(),
      FILE_WINDOW_MS,
      this.maxFiles,
    );
    this.listing = listed.transcripts;
    this.found = listed.found;
    this.truncated = listed.truncated;
    await this.readStale(entries);
    this.dropGone(entries);
    this.changedAt ||= this.clock();
    this.metrics.passes++;
    if (this.dirty && this.clock() - this.lastSaved >= SAVE_GAP_MS) await this.flush();
  }

  async flush() {
    if (!this.options.cacheFile || !this.store || !this.dirty) return;
    this.dirty = false;
    this.lastSaved = this.clock();
    await saveRollup(this.options.cacheFile, this.timeZone, this.store).catch(() => {
      this.dirty = true;
    });
  }

  async refresh(waitMs: number): Promise<void> {
    const start = this.clock();
    if (!this.running) {
      const idle = this.lastPassEnd + this.passGap - start;
      if (idle > waitMs) return;
      if (idle > 0) await sleep(idle);
      this.running ??= this.pass()
        .catch(() => undefined)
        .finally(() => {
          this.running = null;
          this.lastPassEnd = this.clock();
          this.passGap = Math.min(MAX_PASS_GAP_MS, (this.lastPassEnd - start) * PASS_DUTY);
        });
    }
    let timer: NodeJS.Timeout | undefined;
    await Promise.race([
      this.running,
      new Promise<void>((resolve) => {
        timer = setTimeout(resolve, waitMs);
      }),
    ]);
    clearTimeout(timer);
  }

  private async codexLimits(): Promise<CodexLimits | null> {
    const newest = this.listing.filter((t) => t.provider === 'codex').slice(0, 4);
    const stamp = newest.map((t) => `${t.mtime}:${t.size}`).join();
    const memo = this.limitsMemo;
    if (
      memo?.stamp === stamp &&
      memo.value?.windows.every((w) => !w.resetsAt || w.resetsAt > this.clock())
    )
      return memo.value;
    const value = await readCodexLimits(
      newest.map((t) => t.file),
      this.clock(),
    );
    this.limitsMemo = { stamp, value };
    return value;
  }

  private scanState(): ScanState {
    return {
      complete: !this.running && this.pending === 0 && this.store !== null,
      files: this.listing.length,
      pending: this.pending,
      found: this.found,
      truncated: this.truncated,
      failedFiles: this.failedFiles,
      skippedLines: [...(this.store?.values() ?? [])].reduce((n, e) => n + e.state.skipped, 0),
    };
  }

  private trackedFiles(): Tracked[] {
    const entries = this.store ?? new Map<string, Entry>();
    return this.listing.flatMap((transcript) => {
      const entry = entries.get(keyOf(transcript.file));
      return entry ? [{ transcript, entry }] : [];
    });
  }

  async snapshot(
    range: Answer['range'],
    attributions: ReadonlyMap<string, Attribution>,
    claude: Answer['limits']['claude'],
    blank = false,
  ): Promise<Answer> {
    const today = this.dayOf(this.clock());
    const scan = this.scanState();
    const limits = { claude, codex: blank ? null : await this.codexLimits() };
    const sig = JSON.stringify([
      range,
      blank,
      today,
      this.changedAt,
      scan,
      limits,
      [...attributions].map(([key, a]) => [key, a.department, a.repo]),
    ]);
    const hit = this.memo.get(sig);
    if (hit) return hit;
    const answer = aggregate({
      tracked: blank ? [] : this.trackedFiles(),
      today,
      range,
      attributions,
      timezone: this.timeZone,
      generatedAt: this.changedAt || this.clock(),
      scan,
      limits,
    });
    if (this.memo.size >= MEMO_ANSWERS) {
      const oldest = this.memo.keys().next();
      if (!oldest.done) this.memo.delete(oldest.value);
    }
    this.memo.set(sig, answer);
    return answer;
  }
}

export const createUsageStats = (options: UsageOptions) => new UsageTracker(options);

export type UsageStats = UsageTracker;
