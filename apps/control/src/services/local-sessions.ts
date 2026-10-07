import { realpathSync } from 'node:fs';
import { homedir } from 'node:os';
import { stat } from 'node:fs/promises';
import { basename, dirname, join } from 'node:path';
import { assignProcesses, listAgentProcesses } from './agent-processes.js';
import { classifyLiveness, CpuWatch } from './session-liveness.js';
import { git as readGit } from './git-health.js';
import { readHookState } from './hook-spool.js';
import { readClaudeTitle, readCodexTitles } from './session-title.js';
import { mapPool } from './pool.js';
import {
  discoverRaw,
  encodeRoot,
  resetDiscoveryCache,
  sessionsOfProcesses,
  type Raw,
} from './session-discovery.js';
import { readTopic, topicTitle } from './session-topic.js';
import { windowsOf, withContext } from './session-context.js';
import { readUsage } from './session-usage.js';
import { readSessionSignals } from './session-signals.js';
import { resetSubagentTranscripts } from './subagent-transcripts.js';
import { resetOutcomeCache } from './tool-outcomes.js';
import type { ReadBudget } from './subagent-usage.js';
import { readActions } from './session-work.js';
import { resetRoles, roleOf } from './session-role.js';
import { detectModels } from '@aether/providers/models';
import type { AttributedSession, LocalSession } from '@aether/contracts';

// Read-only discovery of local Claude Code / Codex sessions. Metadata only: id, cwd, mtime.
// Transcript content is never retained or returned. Every session with a live process is shown; of the rest, the newest
// MAX_SESSIONS.
export const MAX_SESSIONS = 60;
const MAX_REPOS = 400; // every shown session's directory is classified, none is left unowned by a cap
const GIT_BATCH = 10; // bounds concurrent git processes
const READ_WIDTH = 6; // transcripts read at once
// Bytes of subagent transcripts a scan may read in all; a larger backlog is caught up over the next scans.
const SUBAGENT_BYTES_PER_SCAN = 32 * 1024 * 1024;
const cpuWatch = new CpuWatch();

// The two-letter codes `git status --porcelain=v1` uses for a path with an unresolved merge.
const UNMERGED = /^(?:DD|AU|UD|UA|DU|AA|UU) /;

export function parseGitStatus(text: string): NonNullable<LocalSession['git']> {
  const lines = text.split('\n').filter(Boolean);
  const header = lines.find((l) => l.startsWith('## ')) ?? '';
  const m =
    /^## (?:No commits yet on |Initial commit on )?([^.\s]+(?:\.[^.\s]+)*?)(?:\.\.\.(\S+))?(?: \[(.*)\])?$/.exec(
      header,
    );
  const flags = m?.[3] ?? '';
  return {
    branch: m?.[1] ?? null,
    upstream: m?.[2] ?? null,
    ahead: Number(/ahead (\d+)/.exec(flags)?.[1] ?? 0),
    behind: Number(/behind (\d+)/.exec(flags)?.[1] ?? 0),
    uncommitted: lines.filter((l) => !l.startsWith('## ')).length,
    conflicts: lines.filter((l) => UNMERGED.test(l)).length,
  };
}

const git = (cwd: string, args: string[]) => readGit(cwd, args, 4000, 1024 * 1024);

type RepoInfo = { git: LocalSession['git']; worktree: LocalSession['worktree'] };

// Which repository a directory belongs to hardly ever changes; its branch and changes do, but a scan every few
// seconds need not ask Git again each time (that was two processes per directory per scan).
const IDENTITY_TTL_MS = 5 * 60 * 1000;
const STATUS_TTL_MS = 30 * 1000;
const MAX_CACHED_DIRECTORIES = 512;
const identities = new Map<string, { at: number; value: RepoInfo['worktree'] }>();
const statuses = new Map<string, { at: number; value: RepoInfo['git'] }>();

async function remembered<T>(
  cache: Map<string, { at: number; value: T }>,
  key: string,
  ttl: number,
  now: number,
  read: () => Promise<T>,
): Promise<T> {
  const hit = cache.get(key);
  if (hit && now - hit.at < ttl) return hit.value;
  const value = await read();
  if (cache.size >= MAX_CACHED_DIRECTORIES) cache.clear();
  cache.set(key, { at: now, value });
  return value;
}

async function repoInfo(cwd: string, now: number): Promise<RepoInfo> {
  try {
    if (!(await stat(cwd)).isDirectory()) return { git: null, worktree: null };
    // A directory that is not a repository is remembered as such too, rather than asked about on every scan.
    const [status, worktree] = await Promise.all([
      remembered(statuses, cwd, STATUS_TTL_MS, now, async () =>
        parseGitStatus(
          await git(cwd, ['status', '--porcelain=v1', '-b', '--untracked-files=normal']),
        ),
      ).catch(() => null),
      remembered(identities, cwd, IDENTITY_TTL_MS, now, async () => {
        const ids = await git(cwd, [
          'rev-parse',
          '--path-format=absolute',
          '--git-common-dir',
          '--show-toplevel',
        ]);
        const [common, root] = ids.trim().split('\n');
        if (!common || !root) return null;
        const main = basename(common) === '.git' ? dirname(common) : common;
        return { root, main, project: basename(main), linked: root !== main };
      }).catch(() => null),
    ]);
    return { git: status, worktree };
  } catch {
    return { git: null, worktree: null };
  }
}

const hookSpoolFile = () =>
  process.env['AETHER_HOOK_SPOOL'] ?? join(homedir(), '.aether', 'hook-events.jsonl');

// What the latest scan found, for the home and spool it read; a scan still running is shared by whoever asks meanwhile.
let cache: { key: string; at: number; value: LocalSession[] } | null = null;
let inflight: { key: string; scan: Promise<LocalSession[]> } | null = null;
// Which transcript each session key was found in by the latest scan. The only way a transcript is opened.
let files = new Map<string, { provider: 'claude' | 'codex'; file: string }>();
export const sessionFile = (key: string) => files.get(key) ?? null;
// Which process the latest scan found behind each session. Kept server-side: a stop names a session, never a pid.
let owners = new Map<string, number>();
export const processOf = (key: string) => owners.get(key) ?? null;
export async function scanLocalSessions(
  home: string,
  now = Date.now(),
  ttlMs = 5000,
  spoolFile = hookSpoolFile(),
): Promise<LocalSession[]> {
  const key = `${home}\0${spoolFile}`;
  if (cache?.key === key && now - cache.at < ttlMs) return cache.value;
  if (inflight?.key === key) return inflight.scan;
  const scan = scanOnce(home, now, spoolFile, key).finally(() => {
    if (inflight?.scan === scan) inflight = null;
  });
  inflight = { key, scan };
  return scan;
}

async function scanOnce(
  home: string,
  now: number,
  spoolFile: string,
  key: string,
): Promise<LocalSession[]> {
  // Processes first: they decide which sessions are shown. A no-ps host says 'unknown', never 'none'.
  const [found, live] = await Promise.all([
    discoverRaw(home, now),
    listAgentProcesses().catch(() => null),
  ]);
  if (live) cpuWatch.observe(live.processes, now);
  let sessions = found;
  let running = live ? assignProcesses(sessions, live.processes, live.desktopCodex) : null;
  if (live && running) {
    // A process alive for days in a quiet transcript has no recent file: look its session up from the process.
    const owned = new Set([...running.values()].flatMap((v) => (v.process ? [v.process.pid] : [])));
    const lost = live.processes.filter((p) => !owned.has(p.pid));
    const older = lost.length
      ? await sessionsOfProcesses(home, lost, new Set(sessions.map((r) => r.file))).catch(
          () => [] as Raw[],
        )
      : [];
    if (older.length) {
      sessions = [...sessions, ...older];
      running = assignProcesses(sessions, live.processes, live.desktopCodex);
    }
  }
  // Every session with a process is shown, however old; of the rest, the newest few.
  const alive = (r: Raw) => running?.get(`${r.provider}:${r.sessionId}`)?.state === 'running';
  const raw = [
    ...sessions.filter(alive),
    ...sessions.filter((r) => !alive(r)).slice(0, MAX_SESSIONS),
  ].sort((a, b) => b.mtime - a.mtime);
  const repos = [...new Set(raw.map((r) => r.cwd))].slice(0, MAX_REPOS);
  const infos = await mapPool(repos, GIT_BATCH, async (c) => [c, await repoInfo(c, now)] as const);
  const hooks = await readHookState(spoolFile, now);
  // Each transcript is read through a buffer of a few hundred KB to a few MB: a few at a time, not all sixty.
  // The model catalogs say how big each model's window is (remembered for a short time, never fatal when missing).
  const windows = windowsOf(await detectModels().catch(() => []));
  const usages = new Map(
    await mapPool(
      raw,
      READ_WIDTH,
      async (r) =>
        [r.file, withContext(r.provider, await readUsage(r.provider, r.file), windows)] as const,
    ),
  );
  const codexTitles = await readCodexTitles(home);
  const titles = new Map(
    await mapPool(
      raw,
      READ_WIDTH,
      async (r) =>
        [
          r.file,
          r.provider === 'claude'
            ? await readClaudeTitle(r.file)
            : (codexTitles.get(r.sessionId) ?? null),
        ] as const,
    ),
  );
  const topics = new Map(
    await mapPool(
      raw,
      READ_WIDTH,
      async (r) => [r.file, await readTopic(r.provider, r.file)] as const,
    ),
  );
  const works = new Map(
    await mapPool(
      raw,
      READ_WIDTH,
      async (r) => [r.file, await readActions(r.provider, r.file)] as const,
    ),
  );
  const budget: ReadBudget = { bytes: SUBAGENT_BYTES_PER_SCAN };
  const signals = new Map(
    await mapPool(
      raw,
      READ_WIDTH,
      async (r) =>
        [
          r.file,
          await readSessionSignals(r, hooks.get(`${r.provider}:${r.sessionId}`), now, budget),
        ] as const,
    ),
  );
  const states = new Map(infos);
  const value = raw.map((r): LocalSession => {
    const key = `${r.provider}:${r.sessionId}`;
    const info = states.get(r.cwd);
    const hook = hooks.get(key);
    const signal = signals.get(r.file)!;
    return {
      key,
      provider: r.provider,
      sessionId: r.sessionId,
      cwd: r.cwd,
      repo: info?.worktree?.project ?? basename(r.cwd),
      mtime: Math.round(r.mtime),
      git: info?.git ?? null,
      worktree: info?.worktree ?? null,
      hook: hook
        ? {
            activity: hook.activity,
            lastEvent: hook.lastEvent,
            tool: hook.tool,
            at: hook.at,
            recent: signal.recent,
          }
        : null,
      subagents: signal.subagents,
      // A `codex exec` run has no thread name; its task's opening words name it. A Claude prompt is never sent.
      title:
        titles.get(r.file) ??
        (r.provider === 'codex' ? topicTitle(topics.get(r.file) ?? null) : null),
      classification: roleOf(
        key,
        {
          title: titles.get(r.file) ?? null,
          prompt: topics.get(r.file) ?? null,
          branch: info?.git?.branch ?? null,
          repo: info?.worktree?.project ?? basename(r.cwd),
          subagents: signal.subagents.map((c) => c.type),
          transcript: works.get(r.file) ?? [],
          hook: (hook?.recent ?? [])
            .filter((c) => !c.agentId) // the session's own calls: its helpers' work says what they do, not what it does
            .map(({ tool, target }) => ({ tool, target })),
        },
        now,
      ),
      usage: usages.get(r.file)!,
      process: running?.get(key)?.state ?? 'unknown',
      liveness: classifyLiveness({
        process: running?.get(key)?.process ?? null,
        state: running?.get(key)?.state ?? 'unknown',
        mtime: r.mtime,
        hookAt: hook?.at ?? null,
        busyAt: running?.get(key)?.process ? cpuWatch.busyAt(running.get(key)!.process!) : null,
        now,
      }),
      ports: running?.get(key)?.process?.ports ?? [],
      resources: running?.get(key)?.process
        ? {
            cpuPercent: running.get(key)!.process!.cpuPercent,
            rssBytes: running.get(key)!.process!.rssBytes,
          }
        : null,
    };
  });
  files = new Map(
    raw.map((r) => [`${r.provider}:${r.sessionId}`, { provider: r.provider, file: r.file }]),
  );
  owners = new Map(
    raw.flatMap((r) => {
      const pid = running?.get(`${r.provider}:${r.sessionId}`)?.process?.pid;
      return pid ? [[`${r.provider}:${r.sessionId}`, pid] as const] : [];
    }),
  );
  cache = { key, at: now, value };
  return value;
}
export const resetLocalSessionCache = () => {
  cache = null;
  inflight = null;
  identities.clear();
  statuses.clear();
  resetDiscoveryCache();
  resetRoles();
  resetOutcomeCache();
  resetSubagentTranscripts();
};

const canonical = (path: string) => {
  try {
    return realpathSync(path);
  } catch {
    return path;
  }
};

// Claude Code names a project's scratch directory /tmp/claude-<uid>/<root with every non-alphanumeric as '-'>/…;
// agents launched there (for example headless Codex reviews) belong to that project even outside any repository.
const scratchOwner = /^(?:\/private)?\/tmp\/claude-\d+\/([^/]+)\//;

/** Joins each session to the project whose root is its main checkout, so worktrees share one project. */
export function attributeSessions(
  sessions: readonly LocalSession[],
  projects: readonly { id: string; root: string | null }[],
): AttributedSession[] {
  const roots = projects.flatMap((p) => (p.root ? [{ id: p.id, root: canonical(p.root) }] : []));
  const byRoot = new Map(roots.map((p) => [p.root, p.id]));
  const byScratch = new Map(roots.map((p) => [encodeRoot(p.root), p.id]));
  return sessions.map((s) => ({
    ...s,
    projectId: s.worktree
      ? (byRoot.get(canonical(s.worktree.main)) ?? null)
      : (byScratch.get(scratchOwner.exec(s.cwd)?.[1] ?? '') ?? null),
  }));
}
