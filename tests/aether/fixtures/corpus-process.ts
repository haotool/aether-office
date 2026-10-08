// Cases for product management, research, hygiene, subagents and thin signals.
import { type CorpusCase, edit, read, run, tool } from './corpus-types.js';

export const PROCESS: CorpusCase[] = [
  // Product management
  {
    name: 'roadmap',
    expect: 'product-manager',
    title: 'Plan the Q4 roadmap and prioritise the backlog',
    actions: [...tool('mcp__linear__list_issues')],
  },
  {
    name: 'prd',
    expect: 'product-manager',
    prompt:
      'draft the requirements for the notifications feature and set milestones for the sprint',
  },
  { name: 'zh pm', expect: 'product-manager', prompt: '整理需求與優先順序，排出里程碑與進度' },
  {
    name: 'triage tickets',
    expect: 'product-manager',
    prompt: 'triage the open tickets and estimate the backlog',
    actions: [...tool('mcp__jira__search')],
  },
  // Research / exploration
  {
    name: 'compare options',
    expect: 'research',
    title: 'Research and compare three vector databases',
    actions: [
      ...tool('WebSearch', 'vector database comparison'),
      ...tool('WebFetch', 'https://example.test/docs'),
    ],
  },
  {
    name: 'explore codebase read only',
    expect: 'research',
    prompt: 'how does the scheduler decide which job runs next, investigate',
    actions: [
      ...read('src/sched/a.ts', 'src/sched/b.ts', 'src/sched/c.ts'),
      ...tool('Grep', 'pick_next'),
      ...tool('Glob', 'src/**/*.ts'),
    ],
  },
  { name: 'zh research', expect: 'research', prompt: '調研業界的快取做法並比較優缺點' },
  {
    name: 'explore subagent',
    expect: 'research',
    prompt: 'investigate where retries are handled and how they back off',
    subagents: ['Explore'],
  },
  {
    name: 'feasibility spike',
    expect: 'research',
    prompt:
      'spike: is it feasible to stream the export instead of buffering, evaluate the memory cost',
  },
  // Git / release hygiene vs generalist
  {
    name: 'git housekeeping',
    expect: 'release',
    prompt: 'merge the feature branch, rebase onto main and tag the build',
    actions: [...run('git rebase main', 'git tag build-45', 'git merge --no-ff feat/x')],
  },
  // Subagent types as the session's own agent
  {
    name: 'build error resolver',
    expect: 'platform',
    prompt: 'the build is red, fix the typecheck errors in the pipeline',
    subagents: ['build-error-resolver'],
    actions: [...run('pnpm build')],
  },
  {
    name: 'tdd guide',
    expect: 'qa',
    prompt: 'write the failing test first',
    subagents: ['tdd-guide'],
    actions: [...edit('tests/feature.test.ts')],
  },
  // Headless / thin signals
  {
    name: 'headless codex review',
    expect: 'review',
    prompt: 'Review the following diff for bugs and style problems and report findings only',
  },
  {
    name: 'headless test run',
    expect: 'qa',
    prompt: 'run the full test suite and report failing tests',
    actions: [...run('npm test')],
  },
  // Honest generalist: no real signal
  { name: 'hello', expect: 'generalist', prompt: 'hello' },
  { name: 'continue', expect: 'generalist', prompt: 'continue' },
  { name: 'fix it', expect: 'generalist', prompt: 'fix it please' },
  { name: 'empty', expect: 'generalist' },
  {
    name: 'plain ts edits',
    expect: 'generalist',
    prompt: 'rename the variable and update the callers',
    actions: [...edit('src/util/a.ts', 'src/util/b.ts'), ...run('git status', 'ls')],
  },
  {
    name: 'main branch scratch',
    expect: 'generalist',
    branch: 'main',
    repo: 'scratch',
    title: 'quick question',
  },
  { name: 'thanks', expect: 'generalist', prompt: 'thanks, that worked' },
  {
    name: 'worktree agent branch',
    expect: 'generalist',
    branch: 'worktree-agent-ac3adf2161adf31b9',
    repo: 'notes',
  },
];
