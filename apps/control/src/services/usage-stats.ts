import { createHash } from 'node:crypto';
import { open } from 'node:fs/promises';
import { setTimeout as sleep } from 'node:timers/promises';
import type { CodexLimits, UsageResponse } from '@aether/contracts';
import { readCodexLimits } from './codex-limits.js';
import { aggregate, WINDOW_DAYS, type Attribution, type Tracked } from './usage-aggregate.js';
import { listTranscripts, repoOf, type Transcript } from './usage-files.js';
import { dayKeyOf, newState, parseChunk } from './usage-parse.js';
import { MAX_TRACKED_FILES, keyOf, loadRollup, saveRollup, type Entry } from './usage-store.js';

// Token usage of every local session, per day, kept current by reading only what each transcript gained since the last
// look. The first scan of a long history is done in the background, one file at a time through one shared buffer, with a
// turn of the event loop between chunks, so a request never waits for it: it answers with what is known and says so.

const CHUNK = 1024 * 1024; // about 30 ms of parsing: the longest the event loop is held at a time
const SIG_BYTES = 256;
/** A pass may take about a tenth of the time (the listing of a big history is the cost), never leaving a gap above this. */
const PASS_DUTY = 10;
const MAX_PASS_GAP_MS = 3000;
const SAVE_GAP_MS = 30_000;
const MEMO_ANSWERS = 6; // a few ranges and attribution sets at once
/** Files modified within this many days can hold a day of the window (one more than the window, for the zone's edge). */
const FILE_WINDOW_MS = (WINDOW_DAYS + 1) * 86_400_000;
const tick = () => new Promise<void>((resolve) => setImmediate(resolve));

export type UsageOptions = {
  /** The home directory whose `.claude/projects` and `.codex/sessions` are read. */
  home: string;
  /** IANA zone the days are counted in; defaults to this machine's. */
  timeZone?: string;
  /** Where the numbers-only rollup is kept between runs; none keeps everything in memory. */
  cacheFile?: string | null;
  now?: () => number;
  maxFiles?: number;
};

export function createUsageStats(options: UsageOptions) {
  const timeZone = options.timeZone ?? Intl.DateTimeFormat().resolvedOptions().timeZone;
  const clock = options.now ?? Date.now;
  const maxFiles = options.maxFiles ?? MAX_TRACKED_FILES;
  const dayOf = dayKeyOf(timeZone);
  const buffer = Buffer.allocUnsafe(CHUNK);
  let store: Map<string, Entry> | null = null;
  let listing: Transcript[] = [];
  let pending = 0;
  let running: Promise<void> | null = null;
  let lastPassEnd = 0;
  /** How long after the last pass the next may start: proportional to what that pass cost, so a small history is always fresh. */
  let passGap = 0;
  let lastSaved = 0;
  let dirty = false;
  /** When the numbers last changed: the answer is stamped with it, so an unchanged answer is byte for byte the same (ETag). */
  let changedAt = 0;
  let limitsMemo: { stamp: string; value: CodexLimits | null } | null = null;
  const memo = new Map<string, UsageResponse>();
  const metrics = { bytesRead: 0, filesRead: 0, passes: 0 };

  /** Reads what `t` gained since the last look into its entry; a rewritten or shortened file is read again from the start. */
  async function read(t: Transcript, entries: Map<string, Entry>) {
    const key = keyOf(t.file);
    const handle = await open(t.file, 'r');
    try {
      const { bytesRead: headBytes } = await handle.read(buffer, 0, SIG_BYTES, 0);
      const sig = createHash('sha1')
        .update(buffer.subarray(0, headBytes))
        .digest('hex')
        .slice(0, 12);
      const known = entries.get(key);
      const entry: Entry =
        known && known.sig === sig && known.offset <= t.size
          ? known
          : {
              state: newState(t.provider),
              offset: 0,
              mtime: 0,
              size: 0,
              sig,
              repo: known?.repo ?? null,
            };
      let offset = entry.offset;
      while (offset < t.size) {
        const { bytesRead } = await handle.read(
          buffer,
          0,
          Math.min(CHUNK, t.size - offset),
          offset,
        );
        if (!bytesRead) break;
        metrics.bytesRead += bytesRead;
        const end = buffer.lastIndexOf(10, bytesRead - 1); // only whole lines; the rest is read next time
        if (end < 0) {
          if (bytesRead < CHUNK) break; // an unfinished last line: wait for the rest
          offset += bytesRead; // one line longer than a chunk: step over it
          continue;
        }
        parseChunk(entry.state, buffer.subarray(0, end), dayOf);
        offset += end + 1;
        await tick();
      }
      entries.set(key, {
        ...entry,
        offset,
        mtime: t.mtime,
        size: t.size,
        repo: entry.repo ?? (await repoOf(t)),
      });
      metrics.filesRead++;
    } finally {
      await handle.close();
    }
  }

  async function pass() {
    const entries = (store ??= options.cacheFile
      ? await loadRollup(options.cacheFile, timeZone)
      : new Map());
    listing = await listTranscripts(options.home, clock(), FILE_WINDOW_MS, maxFiles);
    const stale = listing.filter((t) => {
      const e = entries.get(keyOf(t.file));
      return !e || e.mtime !== t.mtime || e.size !== t.size;
    });
    pending = stale.length;
    for (const t of stale) {
      try {
        await read(t, entries);
        dirty = true;
        changedAt = clock();
      } catch {
        /* vanished or unreadable: skipped, never fatal */
      }
      pending--;
    }
    const listed = new Set(listing.map((t) => keyOf(t.file)));
    for (const key of entries.keys())
      if (!listed.has(key)) {
        entries.delete(key);
        dirty = true;
        changedAt = clock();
      }
    changedAt ||= clock();
    metrics.passes++;
    if (dirty && clock() - lastSaved >= SAVE_GAP_MS) await flush();
  }

  /** Writes the rollup now (when there is a file to write it to and something new in it). */
  async function flush() {
    if (!options.cacheFile || !store || !dirty) return;
    dirty = false;
    lastSaved = clock();
    await saveRollup(options.cacheFile, timeZone, store).catch(() => {
      dirty = true; // try again next time
    });
  }

  /**
   * Starts a scan unless one is running, and waits at most `waitMs` for it: the caller gets what is known by then
   * (`scan.complete` says whether that is everything). A scan that just ended is waited out when its gap is short, so a
   * file that appeared since is counted by this very request; after a costly one the caller gets what is known.
   */
  async function refresh(waitMs: number): Promise<void> {
    const start = clock();
    if (!running) {
      const idle = lastPassEnd + passGap - start;
      if (idle > waitMs) return;
      if (idle > 0) await sleep(idle);
      running ??= pass()
        .catch(() => undefined)
        .finally(() => {
          running = null;
          lastPassEnd = clock();
          passGap = Math.min(MAX_PASS_GAP_MS, (lastPassEnd - start) * PASS_DUTY);
        });
    }
    let timer: NodeJS.Timeout | undefined;
    await Promise.race([
      running,
      new Promise<void>((resolve) => {
        timer = setTimeout(resolve, waitMs);
      }),
    ]);
    clearTimeout(timer);
  }

  async function codexLimits(): Promise<CodexLimits | null> {
    const newest = listing.filter((t) => t.provider === 'codex').slice(0, 4);
    const stamp = newest.map((t) => `${t.mtime}:${t.size}`).join();
    if (
      limitsMemo?.stamp === stamp &&
      limitsMemo.value?.windows.every((w) => !w.resetsAt || w.resetsAt > clock())
    )
      return limitsMemo.value;
    const value = await readCodexLimits(
      newest.map((t) => t.file),
      clock(),
    );
    limitsMemo = { stamp, value };
    return value;
  }

  async function snapshot(
    range: UsageResponse['range'],
    attributions: ReadonlyMap<string, Attribution>,
    claude: UsageResponse['limits']['claude'],
    /** Answer with nothing (local sessions are switched off) whatever has been read. */
    blank = false,
  ): Promise<UsageResponse> {
    const today = dayOf(clock());
    const scan = {
      complete: !running && pending === 0 && store !== null,
      files: listing.length,
      pending,
    };
    const limits = { claude, codex: blank ? null : await codexLimits() };
    // The answer depends on what was read, the day, who the sessions are and the limits: when none changed, it is reused.
    const sig = JSON.stringify([
      range,
      blank,
      today,
      changedAt,
      scan,
      limits,
      [...attributions].map(([key, a]) => [key, a.department, a.repo]),
    ]);
    const hit = memo.get(sig);
    if (hit) return hit;
    const entries = store ?? new Map<string, Entry>();
    const tracked: Tracked[] = (blank ? [] : listing).flatMap((transcript) => {
      const entry = entries.get(keyOf(transcript.file));
      return entry ? [{ transcript, entry }] : [];
    });
    const answer = aggregate({
      tracked,
      today,
      range,
      attributions,
      timezone: timeZone,
      generatedAt: changedAt || clock(),
      scan,
      limits,
    });
    if (memo.size >= MEMO_ANSWERS) memo.delete(memo.keys().next().value!);
    memo.set(sig, answer);
    return answer;
  }

  return { refresh, snapshot, flush, metrics, timeZone };
}

export type UsageStats = ReturnType<typeof createUsageStats>;
