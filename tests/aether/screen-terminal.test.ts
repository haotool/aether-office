import { describe, expect, it } from 'vitest';
import {
  commandKind,
  revealedLines,
  terminalOutput,
  type CommandKind,
} from '../../packages/office-scene/src/screen-terminal-gen.js';

const CONTEXT = {
  branch: 'feat/login',
  edited: ['auth.ts', 'login.tsx'],
  ports: [5173],
  uncommitted: 3,
};
const HEADS = [
  'pnpm install',
  'pnpm build',
  'pnpm test',
  'vitest',
  'git status',
  'git log',
  'git diff',
  'git push',
  'docker build',
  'kubectl get',
  'ls',
  'node server.js',
  'curl',
  null,
];

describe('terminal output', () => {
  it('sorts a real command into the kind of output it would make', () => {
    const kinds: Record<string, CommandKind> = {
      'pnpm install': 'install',
      'npm test': 'test',
      vitest: 'test',
      'cargo build': 'build',
      'git status': 'git-status',
      'git diff': 'git-diff',
      'git log': 'git-log',
      'git push': 'git-other',
      'docker build': 'docker',
      kubectl: 'kube',
      ls: 'list',
      node: 'run',
      whoami: 'generic',
    };
    for (const [head, kind] of Object.entries(kinds)) expect(commandKind(head)).toBe(kind);
    expect(commandKind(null)).toBe('generic');
  });

  it('is the same for the same seed and command, and differs between members', () => {
    const a = terminalOutput('m1', 'pnpm build', CONTEXT, 40);
    expect(terminalOutput('m1', 'pnpm build', CONTEXT, 40)).toEqual(a);
    expect(terminalOutput('m2', 'pnpm build', CONTEXT, 40)).not.toEqual(a);
  });

  it('never invents an outcome: no check marks, crosses or counted passes for any command', () => {
    for (const head of HEADS)
      for (const seed of ['m1', 'm2', 'm3']) {
        const text = terminalOutput(seed, head, CONTEXT, 60)
          .map((l) => l.text)
          .join('\n');
        expect(text, `${head}`).not.toMatch(
          /[✓✗✔✘]|\bpass(ed)?\b|\bfail(ed)?\b|exit code|\b\d+ (tests?|specs?) (passed|failed)\b/i,
        );
      }
  });

  it('draws git status from the real branch and the files really edited', () => {
    const text = terminalOutput('m1', 'git status', CONTEXT, 20)
      .map((l) => l.text)
      .join('\n');
    expect(text).toContain('feat/login');
    expect(text).toContain('auth.ts');
    expect(text).toContain('login.tsx');
  });

  it('names a real port a server is listening on, and only a real one', () => {
    const text = terminalOutput('m1', 'node server.js', CONTEXT, 20)
      .map((l) => l.text)
      .join('\n');
    expect(text).toContain(':5173');
    const none = terminalOutput('m1', 'node server.js', { ...CONTEXT, ports: [] }, 20)
      .map((l) => l.text)
      .join('\n');
    expect(none).not.toMatch(/:\d{4}/);
  });

  it('streams in bursts and pauses, never faster at the start than the cadence allows', () => {
    expect(revealedLines('m1', 0)).toBeLessThanOrEqual(1);
    let last = 0;
    const gaps: number[] = [];
    for (let t = 0; t < 30_000; t += 50) {
      const n = revealedLines('m1', t);
      expect(n).toBeGreaterThanOrEqual(last);
      if (n > last) gaps.push(t);
      last = n;
    }
    expect(last).toBeGreaterThan(10);
    const spacing = gaps.slice(1).map((t, i) => t - gaps[i]!);
    expect(spacing.some((g) => g >= 400)).toBe(true);
    expect(spacing.some((g) => g <= 200)).toBe(true);
  });
});
