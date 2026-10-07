import { ROLE_LABELS, type DepartmentId, type RoleId } from './departments.js';
import { COMMANDS, PATHS, TOOLS, WORDS, roleOfSubagent } from './role-signals.js';

// Which engineering role a session's work belongs to. Pure and deterministic: every signal adds weighted points to the
// roles it points at, the best role wins if it is clearly ahead, and otherwise the session stays a neutral generalist.
// Each point comes with a short evidence string, so the answer can always say why. Nothing here keeps input text: the
// evidence holds only the matched keyword or a label of the kind of file or command.

/** One tool call a session made: the tool's name and what it aimed at (a file path, a command, a subagent type). */
export type ToolCall = { tool: string; target: string | null };

export type ClassifyInput = {
  title?: string | null;
  /** What the session was asked to do. Used to decide, never kept. */
  prompt?: string | null;
  branch?: string | null;
  repo?: string | null;
  /** Its recent tool calls, oldest first. */
  actions?: readonly ToolCall[];
  /** The types of the subagents it has running. */
  subagents?: readonly string[];
};

export type Classification = {
  role: RoleId;
  department: DepartmentId;
  /** 0 to 1: how far the role is ahead of the next best. For a generalist, how close the best candidate came. */
  confidence: number;
  /** The strongest reasons, best first, as `kind: detail` (kinds: title, prompt, branch, repo, edits, reads, runs, tool, subagent, mix). */
  evidence: string[];
};

type Tally = { score: number; evidence: string[] };
type Scored = Classification & { byRole: Partial<Record<RoleId, Tally>> };

/** Below this much evidence in total, or this confidence, a session stays a generalist rather than a wrong guess. */
const MIN_SCORE = 1.5;
const MIN_CONFIDENCE = 0.4;
const SOURCE_CAP = 4; // one source (a title, a prompt, the recent work) cannot carry a role further than this
const ACTIVITY_CAP = 6;
const RECENT_ACTIONS = 40;
const MAX_EVIDENCE = 5;
const EVIDENCE_CHARS = 80;
// Words weigh most in a title, a little less in a prompt, and least in a repository's name.
// What a prompt opens with states the task; what follows is usually context, so it weighs half as much.
const PROMPT_HEAD_CHARS = 120;
const SOURCE_WEIGHT = { title: 1, prompt: 0.8, promptRest: 0.4, branch: 1, repo: 0.5 } as const;
const WRITES = new Set(['Edit', 'Write', 'MultiEdit', 'NotebookEdit', 'apply_patch']);
const READS = new Set(['Read', 'NotebookRead']);
const SHELLS = new Set(['Bash', 'shell', 'exec_command', 'exec', 'local_shell']);
const DELEGATES = new Set(['Task', 'Agent']);
const LOOKUPS = new Set(['Read', 'NotebookRead', 'Grep', 'Glob', 'LS', 'WebSearch', 'WebFetch']);

// Every kind of session sends out Explore and Plan agents, so they say little about their parent; a reviewer or a test
// writer says more.
const GENERIC_SUBAGENT_ROLES = new Set<RoleId>(['research', 'architect']);
const FULLSTACK_MIN = 3;
const FULLSTACK_BALANCE = 0.6;

const GLOBAL_WORDS = WORDS.map(
  ([role, strength, pattern]) =>
    [role, strength, new RegExp(pattern.source, `${pattern.flags}g`)] as const,
);

class Ledger {
  readonly byRole = new Map<RoleId, Tally>();
  private readonly spent = new Map<string, number>();

  /** Adds points for `role` from `source`, never taking that source past its cap for the role. */
  add(role: RoleId, source: string, points: number, evidence: string, cap = SOURCE_CAP): void {
    const key = `${source}:${role}`;
    const used = this.spent.get(key) ?? 0;
    const granted = Math.max(0, Math.min(points, cap - used));
    if (granted <= 0) return;
    this.spent.set(key, used + granted);
    const tally = this.byRole.get(role) ?? { score: 0, evidence: [] };
    tally.score += granted;
    if (!tally.evidence.includes(evidence)) tally.evidence.push(evidence);
    this.byRole.set(role, tally);
  }
}

const clip = (s: string) => (s.length > EVIDENCE_CHARS ? `${s.slice(0, EVIDENCE_CHARS - 1)}…` : s);

function addWords(
  ledger: Ledger,
  source: keyof typeof SOURCE_WEIGHT,
  text: string | null | undefined,
) {
  if (!text) return;
  // Branch names are `type/some-words`; making the separators spaces lets whole-word patterns see each word.
  const haystack = source === 'branch' ? text.replace(/[/_.-]+/g, ' ') : text;
  for (const [role, strength, pattern] of GLOBAL_WORDS) {
    // Several different words for one role count for more than one, up to the third.
    const hits = [...new Set([...haystack.matchAll(pattern)].map((m) => m[0].toLowerCase()))];
    if (!hits.length) continue;
    const reach = 1 + 0.5 * (Math.min(hits.length, 3) - 1);
    ledger.add(
      role,
      source,
      strength * SOURCE_WEIGHT[source] * reach,
      `${source === 'promptRest' ? 'prompt' : source}: ${hits.slice(0, 2).join(', ').slice(0, 40)}`,
    );
  }
}

function addActions(ledger: Ledger, actions: readonly ToolCall[]) {
  const recent = actions.slice(-RECENT_ACTIONS);
  const counts = new Map<
    string,
    { role: RoleId; weight: number; label: string; verb: string; n: number }
  >();
  const note = (role: RoleId, weight: number, verb: string, label: string) => {
    const key = `${verb}|${label}|${role}`;
    const entry = counts.get(key) ?? { role, weight, label, verb, n: 0 };
    entry.n++;
    counts.set(key, entry);
  };
  for (const { tool, target } of recent) {
    for (const [pattern, role, weight, label] of TOOLS)
      if (pattern.test(tool)) note(role, weight, 'tool', label);
    if (!target) continue;
    if (DELEGATES.has(tool)) {
      const role = roleOfSubagent(target);
      if (role) note(role, 0.8, 'subagent', `delegates to ${target.slice(0, 32)}`);
    } else if (WRITES.has(tool) || READS.has(tool)) {
      const rule = PATHS.find(([, , pattern]) => pattern.test(target));
      if (rule)
        note(
          rule[0],
          rule[1] * (WRITES.has(tool) ? 1 : 0.25),
          WRITES.has(tool) ? 'edits' : 'reads',
          rule[3],
        );
    } else if (SHELLS.has(tool)) {
      for (const [role, weight, pattern, label] of COMMANDS)
        if (pattern.test(target)) note(role, weight, 'runs', label);
    }
  }
  for (const { role, weight, label, verb, n } of counts.values())
    ledger.add(
      role,
      'activity',
      weight * n,
      n > 1 ? `${verb}: ${label} ×${n}` : `${verb}: ${label}`,
      ACTIVITY_CAP,
    );
  // Looking without touching is what research and exploration are.
  if (recent.length >= 5 && recent.every((a) => LOOKUPS.has(a.tool)))
    ledger.add('research', 'activity-lookups', 2, 'reads: read-only exploration');
}

/** Frontend and backend work in balance is full-stack work, a role of its own rather than a tie. */
function addFullstack(ledger: Ledger) {
  const front = ledger.byRole.get('frontend')?.score ?? 0;
  const back = ledger.byRole.get('backend')?.score ?? 0;
  if (
    Math.min(front, back) < FULLSTACK_MIN ||
    Math.min(front, back) < FULLSTACK_BALANCE * Math.max(front, back)
  )
    return;
  ledger.add(
    'fullstack',
    'mix',
    Math.max(front, back) + 0.5,
    'mix: UI and server work together',
    Infinity,
  );
}

const confidenceOf = (score: number, others: number) => score / (score + others + 1);

/** The role's own points, and how far ahead of the best other role they put it (fullstack is not "behind" its halves). */
function view(
  byRole: Scored['byRole'],
  role: RoleId,
): Pick<Classification, 'confidence' | 'evidence'> {
  const own = byRole[role]?.score ?? 0;
  const rival = Object.entries(byRole)
    .filter(([r]) => r !== role && !(role === 'fullstack' && (r === 'frontend' || r === 'backend')))
    .reduce((best, [, t]) => Math.max(best, t?.score ?? 0), 0);
  return {
    confidence: Math.round(confidenceOf(own, rival) * 100) / 100,
    evidence: (byRole[role]?.evidence ?? []).slice(0, MAX_EVIDENCE).map(clip),
  };
}

const NO_SIGNAL = 'no clear signal';
const result = (role: RoleId, byRole: Scored['byRole'], best: RoleId | null): Scored => {
  const shown = view(byRole, role === 'generalist' && best ? best : role);
  return {
    role,
    department: ROLE_LABELS[role].department,
    confidence: role === 'generalist' && !best ? 0 : shown.confidence,
    evidence: role === 'generalist' ? [NO_SIGNAL] : shown.evidence,
    byRole,
  };
};

/** Pure. Scores every role from every signal and picks the clear winner, or a generalist when nothing is clear. */
export function scoreSession(input: ClassifyInput): Scored {
  const ledger = new Ledger();
  addWords(ledger, 'title', input.title);
  addWords(ledger, 'prompt', input.prompt?.slice(0, PROMPT_HEAD_CHARS));
  addWords(ledger, 'promptRest', input.prompt?.slice(PROMPT_HEAD_CHARS));
  addWords(ledger, 'branch', input.branch);
  addWords(ledger, 'repo', input.repo);
  addActions(ledger, input.actions ?? []);
  for (const type of input.subagents ?? []) {
    const role = roleOfSubagent(type);
    if (role)
      ledger.add(
        role,
        'subagent',
        GENERIC_SUBAGENT_ROLES.has(role) ? 0.5 : 1.5,
        `subagent: ${type.slice(0, 32)}`,
        3,
      );
  }
  addFullstack(ledger);
  const byRole = Object.fromEntries(ledger.byRole) as Scored['byRole'];
  const ranked = [...ledger.byRole].sort(
    (a, b) => b[1].score - a[1].score || a[0].localeCompare(b[0]),
  );
  const best = ranked[0]?.[0] ?? null;
  if (best === null) return result('generalist', byRole, null);
  const { confidence } = view(byRole, best);
  const strong = (ledger.byRole.get(best)?.score ?? 0) >= MIN_SCORE && confidence >= MIN_CONFIDENCE;
  return result(strong ? best : 'generalist', byRole, best);
}

/** Pure. The classification alone, for callers that decide once and keep nothing. */
export function classifySession(input: ClassifyInput): Classification {
  const { role, department, confidence, evidence } = scoreSession(input);
  return { role, department, confidence, evidence };
}

/** The type of a subagent seen as a worker of its own: its role, or null when its name says nothing. */
export { roleOfSubagent };

// Stability. A character that changed department on every turn would be a character nobody could find. A session keeps
// the role it has until a different one has been ahead on several separate looks, spaced apart in time, and, between two
// specialities, by a clear margin.
export type Settled = {
  role: RoleId;
  candidate: RoleId | null;
  streak: number;
  at: number;
  /** Why the held role was last seen to be right, kept for while the latest look shows nothing for it. */
  evidence: string[];
};
const SWITCH_LOOKS = 3;
const LOOK_GAP_MS = 15_000;
const SWITCH_MARGIN = 1.5;

/** Pure. Folds one new look at a session into what was decided before; returns the held role's view and the new state. */
export function settle(
  prev: Settled | undefined,
  next: Scored,
  now: number,
): { state: Settled; classification: Classification } {
  const hold = (state: Omit<Settled, 'evidence'>) => {
    const best = Object.entries(next.byRole).sort(
      (a, b) => (b[1]?.score ?? 0) - (a[1]?.score ?? 0),
    )[0]?.[0] as RoleId | undefined;
    const shown = result(
      state.role,
      next.byRole,
      state.role === 'generalist' ? (best ?? null) : state.role,
    );
    const evidence =
      shown.evidence.length && next.byRole[state.role]
        ? shown.evidence
        : (prev?.evidence ?? shown.evidence);
    const { byRole: _unused, ...classification } = shown;
    return { state: { ...state, evidence }, classification: { ...classification, evidence } };
  };
  if (!prev) return hold({ role: next.role, candidate: null, streak: 0, at: now });
  if (next.role === prev.role) return hold({ ...prev, candidate: null, streak: 0 });
  if (prev.candidate === next.role && now - prev.at < LOOK_GAP_MS) return hold(prev);
  const streak = prev.candidate === next.role ? prev.streak + 1 : 1;
  const ahead =
    prev.role === 'generalist' ||
    next.role === 'generalist' ||
    (next.byRole[next.role]?.score ?? 0) >= (next.byRole[prev.role]?.score ?? 0) + SWITCH_MARGIN;
  if (streak >= SWITCH_LOOKS && ahead)
    return hold({ role: next.role, candidate: null, streak: 0, at: now });
  return hold({
    role: prev.role,
    candidate: next.role,
    streak: Math.min(streak, SWITCH_LOOKS),
    at: now,
  });
}
