import { describe, expect, it } from 'vitest';
import {
  chooseView,
  currentWork,
  type WorkFacts,
} from '../../packages/office-scene/src/screen/screen-layout.js';
import { generateFile } from '../../packages/office-scene/src/screen/screen-codegen.js';
import { terminalOutput } from '../../packages/office-scene/src/screen/screen-terminal-gen.js';

const facts = (over: Partial<WorkFacts>): WorkFacts => ({
  state: 'working',
  tool: null,
  recent: [],
  ...over,
});
const view = (role: string, f: Partial<WorkFacts>, now = 0) =>
  chooseView(role, currentWork(facts(f)), facts(f).state, 'seed-1', now);

describe('what the member is doing right now', () => {
  it('is the running tool when it is the last call, else the last call that finished', () => {
    const recent = [
      { tool: 'Edit', target: 'a.ts' },
      { tool: 'Bash', target: 'pnpm test' },
    ];
    expect(currentWork(facts({ tool: 'Bash', recent }))).toMatchObject({
      kind: 'test',
      head: 'pnpm test',
      file: 'a.ts',
    });
    expect(currentWork(facts({ tool: null, recent }))).toMatchObject({
      kind: 'test',
      thinking: true,
    });
    expect(currentWork(facts({ tool: 'Grep', recent }))).toMatchObject({
      kind: 'search',
      target: null,
    });
    expect(currentWork(facts({ recent: [] }))).toMatchObject({ kind: 'other', file: null });
  });

  it('knows the file and its language only from a real target', () => {
    const work = currentWork(
      facts({ tool: 'Edit', recent: [{ tool: 'Edit', target: 'model.py' }] }),
    );
    expect(work).toMatchObject({ file: 'model.py', lang: 'py' });
    expect(
      currentWork(facts({ tool: 'Write', recent: [{ tool: 'Write', target: null }] })).lang,
    ).toBeNull();
  });
});

describe('which view the screen shows', () => {
  const edit = (target: string) => ({ tool: 'Edit', recent: [{ tool: 'Edit', target }] });
  const bash = (target: string) => ({ tool: 'Bash', recent: [{ tool: 'Bash', target }] });

  it('follows the kind of work, then the role', () => {
    expect(view('backend', edit('app.ts'))).toBe('editor');
    expect(view('docs', edit('guide.md'))).toBe('docs');
    expect(view('backend', edit('README.md'))).toBe('docs');
    expect(view('data', edit('train.py'))).toBe('notebook');
    expect(view('frontend', edit('button.css'))).toBe('design');
    expect(view('backend', bash('ls'))).toBe('terminal');
    expect(view('qa', bash('pnpm test'))).toBe('tests');
    expect(view('backend', bash('pnpm test'))).toBe('terminal');
    expect(view('backend', bash('git diff'))).toBe('git-diff');
    expect(view('backend', bash('git status'))).toBe('git-graph');
    expect(
      view('backend', { tool: 'WebFetch', recent: [{ tool: 'WebFetch', target: 'example.com' }] }),
    ).toBe('browser');
    expect(view('backend', { tool: 'Task', recent: [{ tool: 'Task', target: null }] })).toBe(
      'chat',
    );
  });

  it('falls back to what the role usually has open when there is nothing to go by', () => {
    expect(view('sre', {})).toBe('dashboard');
    expect(view('data', {})).toBe('notebook');
    expect(view('backend', {})).toBe('editor');
  });

  it('locks the screen of a member who is not working and keeps the work behind an approval prompt', () => {
    for (const state of ['idle', 'offline', 'unknown'] as const)
      expect(chooseView('backend', currentWork(facts({ state })), state, 'seed-1', 0)).toBe('lock');
    const asking = facts({
      state: 'waiting_permission',
      tool: 'Bash',
      recent: [{ tool: 'Bash', target: 'ls' }],
    });
    expect(chooseView('backend', currentWork(asking), asking.state, 'seed-1', 0)).toBe('terminal');
  });

  it('glances at a reference window now and then while the model is thinking, and never during a tool', () => {
    const thinking = facts({ recent: [{ tool: 'Edit', target: 'a.ts' }] });
    const seen = new Set<string>();
    for (let bucket = 0; bucket < 60; bucket++)
      seen.add(chooseView('backend', currentWork(thinking), 'working', 'seed-1', bucket * 40_000));
    expect(seen.size).toBeGreaterThan(1);
    for (let bucket = 0; bucket < 60; bucket++)
      expect(view('backend', edit('a.ts'), bucket * 40_000)).toBe('editor');
  });
});

describe('the screen does not flicker when unrelated facts change', () => {
  it('draws the same view, code and terminal for the same member, tool and file', () => {
    const base = { tool: 'Edit', recent: [{ tool: 'Edit', target: 'auth.ts' }] };
    const a = facts(base);
    const b = facts({ ...base });
    expect(currentWork(a)).toEqual(currentWork(b));
    expect(view('backend', base, 1000)).toBe(view('backend', base, 99_000));
    const code = generateFile('seed-1', 'auth.ts', 'ts');
    expect(generateFile('seed-1', 'auth.ts', 'ts')).toBe(code);
    const ctx = { branch: 'main', edited: ['auth.ts'], ports: [], uncommitted: 1 };
    expect(terminalOutput('seed-1', 'pnpm build', ctx, 30)).toEqual(
      terminalOutput('seed-1', 'pnpm build', { ...ctx, uncommitted: 9 }, 30),
    );
  });
});
