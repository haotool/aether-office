import { createHash } from 'node:crypto';
import { open, type FileHandle } from 'node:fs/promises';
import { setTimeout as sleep } from 'node:timers/promises';
import type { CodexLimits, UsageResponse } from '@aether/contracts';
import { readCodexLimits } from './codex-limits.js';
import { aggregate, WINDOW_DAYS, type Attribution, type Tracked } from './usage-aggregate.js';
import { listTranscripts, parentOf, repoOf, type Transcript } from './usage-files.js';
import { ClaimBook } from './usage-claude.js';
import { newState } from './usage-counters.js';
import { dayKeyOf, parseChunk } from './usage-parse.js';
import { MAX_TRACKED_FILES, keyOf, loadRollup, saveRollup, type Entry } from './usage-store.js';

// Token usage of every local session, per day, kept current by reading only what each transcript gained since the last
// look. The first scan of a long history is done in the background, one file at a time through one shared buffer, with a
// turn of the event loop between chunks, so a request never waits for it: it answers with what is known and says so.

const CHUNK = 1024 * 1024; // about 30 ms of parsing: the longest the event loop is held at a time
const SIG_BYTES = 256;
const sha = (data: Buffer) => createHash('sha1').update(data).digest('hex').slice(0, 12);
/** A pass may take about a tenth of the time (the listing of a big history is the cost), never leaving a gap above this. */
const PASS_DUTY = 10;
const MAX_PASS_GAP_MS = 3000;
const SAVE_GAP_MS = 30_000;
const MEMO_ANSWERS = 6; // a few ranges and attribution sets at once
/** Files modified within this many days can hold a day of the window (one more than the window, for the zone's edge). */
const FILE_WINDOW_MS = (WINDOW_DAYS + 1) * 86_400_000;
const tick = () => new Promise<void>((resolve) => setImmediate(resolve));

type UsageOptions = {
  /** The home directory whose `.claude/projects` and `.codex/sessions` are read. */
  home: string;
  /** IANA zone the days are counted in; defaults to this machine's. */
  timeZone?: string;
  /** Where the numbers-only rollup is kept between runs; none keeps everything in memory. */
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
  /** How long after the last pass the next may start: proportional to what that pass cost, so a small history is always fresh. */
  private passGap = 0;
  private lastSaved = 0;
  private dirty = false;
  /** When the numbers last changed: the answer is stamped with it, so an unchanged answer is byte for byte the same (ETag). */
  private changedAt = 0;
  private limitsMemo: { stamp: string; value: CodexLimits | null } | null = null;
  private readonly memo = new Map<string, Answer>();
  /** Which Claude messages some file already counted: a copy of one in another file adds nothing. */
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

  /** The hash of the bytes just before `offset` (the whole file's start when there are fewer). */
  private async tailOf(handle: FileHandle, offset: number): Promise<string> {
    const from = Math.max(0, offset - SIG_BYTES);
    const { bytesRead } = await handle.read(this.buffer, 0, offset - from, from);
    return sha(this.buffer.subarray(0, bytesRead));
  }

  /** The entry to continue from: the known one if the file only grew, else an empty one (its messages are counted again). */
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

  /** Parses the whole lines `entry` has not seen yet and returns the offset reached. */
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
      const end = this.buffer.lastIndexOf(10, bytesRead - 1); // only whole lines; the rest is read next time
      if (end < 0) {
        if (bytesRead < CHUNK) break; // an unfinished last line: wait for the rest
        offset += bytesRead; // one line longer than a chunk: step over it
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

  /** Forgets the files that are no longer listed (and the messages they counted). */
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

  /** Writes the rollup now (when there is a file to write it to and something new in it). */
  async flush() {
    if (!this.options.cacheFile || !this.store || !this.dirty) return;
    this.dirty = false;
    this.lastSaved = this.clock();
    await saveRollup(this.options.cacheFile, this.timeZone, this.store).catch(() => {
      this.dirty = true; // try again next time
    });
  }

  /**
   * Starts a scan unless one is running, and waits at most `waitMs` for it: the caller gets what is known by then
   * (`scan.complete` says whether that is everything). A scan that just ended is waited out when its gap is short, so a
   * file that appeared since is counted by this very request; after a costly one the caller gets what is known.
   */
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

  /** The transcripts read so far, each with its entry. */
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
    /** Answer with nothing (local sessions are switched off) whatever has been read. */
    blank = false,
  ): Promise<Answer> {
    const today = this.dayOf(this.clock());
    const scan = this.scanState();
    const limits = { claude, codex: blank ? null : await this.codexLimits() };
    // The answer depends on what was read, the day, who the sessions are and the limits: when none changed, it is reused.
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
