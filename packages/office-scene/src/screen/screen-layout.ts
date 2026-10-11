import { memberRng } from './screen-seed.js';
import { languageOf, type LangId } from './screen-lang.js';
import { kindOf, type ToolCall, type WorkKind } from './screen-work.js';

export type ViewId =
  | 'editor'
  | 'terminal'
  | 'browser'
  | 'tests'
  | 'git-graph'
  | 'git-diff'
  | 'chat'
  | 'notebook'
  | 'design'
  | 'docs'
  | 'dashboard'
  | 'lock';

export type WorkFacts = {
  state: 'working' | 'idle' | 'waiting_permission' | 'offline' | 'unknown';
  tool: string | null;
  recent: readonly ToolCall[];
};

export type Work = {
  kind: WorkKind;
  tool: string | null;
  target: string | null;
  head: string | null;
  file: string | null;
  lang: LangId | null;
  thinking: boolean;
};

const FILE_KINDS = new Set<WorkKind>(['edit', 'read']);
const AGENT_TOOLS = /^(Task|Agent|SendMessage|TaskCreate|TeamCreate|Delegate)/;

export function currentWork(facts: WorkFacts): Work {
  const last = facts.recent[facts.recent.length - 1] ?? null;
  const call: ToolCall | null = facts.tool
    ? last && last.tool === facts.tool
      ? last
      : { tool: facts.tool, target: null }
    : last;
  const kind = call ? kindOf(call) : 'other';
  const file =
    [...facts.recent].reverse().find((c) => FILE_KINDS.has(kindOf(c)) && c.target)?.target ?? null;
  return {
    kind,
    tool: call?.tool ?? null,
    target: call?.target ?? null,
    head: kind === 'shell' || kind === 'git' || kind === 'test' ? (call?.target ?? null) : null,
    file,
    lang: languageOf(file),
    thinking: facts.state === 'working' && !facts.tool,
  };
}

const ROLE_DEFAULT: Record<string, ViewId> = {
  sre: 'dashboard',
  platform: 'dashboard',
  release: 'git-graph',
  qa: 'tests',
  review: 'git-diff',
  data: 'notebook',
  ml: 'notebook',
  analytics: 'notebook',
  architect: 'design',
  docs: 'docs',
  'product-manager': 'docs',
  research: 'browser',
};
const ROLE_REFERENCE: Record<string, ViewId> = {
  frontend: 'browser',
  backend: 'terminal',
  sre: 'terminal',
  platform: 'terminal',
  qa: 'browser',
  data: 'docs',
  ml: 'dashboard',
  analytics: 'dashboard',
  'product-manager': 'chat',
};
const GLANCE_BUCKET_MS = 40_000;
const GLANCE_CHANCE = 0.3;

const TESTERS = new Set(['qa', 'review', 'security', 'platform']);
const DATA_ROLES = new Set(['data', 'ml', 'analytics']);

function fileView(role: string, work: Work): ViewId {
  if (work.lang === 'md') return 'docs';
  if (DATA_ROLES.has(role) && (work.lang === 'py' || work.lang === 'sql' || work.lang === 'json'))
    return 'notebook';
  if ((role === 'frontend' || role === 'mobile') && work.lang === 'css') return 'design';
  return 'editor';
}

export function chooseView(
  role: string,
  work: Work,
  state: WorkFacts['state'],
  seed: string,
  nowMs: number,
): ViewId {
  if (state !== 'working' && state !== 'waiting_permission') return 'lock';
  if (
    work.thinking &&
    memberRng(seed, `glance:${Math.floor(nowMs / GLANCE_BUCKET_MS)}`)() < GLANCE_CHANCE
  )
    return ROLE_REFERENCE[role] ?? 'browser';
  switch (work.kind) {
    case 'edit':
    case 'read':
      return fileView(role, work);
    case 'shell':
      return 'terminal';
    case 'test':
      return TESTERS.has(role) ? 'tests' : 'terminal';
    case 'git':
      return /^git (diff|show)\b/.test(work.head ?? '') ? 'git-diff' : 'git-graph';
    case 'search':
      return role === 'docs' ? 'docs' : 'terminal';
    case 'web':
      return 'browser';
    default:
      return work.tool && AGENT_TOOLS.test(work.tool) ? 'chat' : (ROLE_DEFAULT[role] ?? 'editor');
  }
}
