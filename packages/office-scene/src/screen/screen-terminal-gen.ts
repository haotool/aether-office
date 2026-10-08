import { MEMO_LIMIT, memoized } from '../environment/memo.js';
import { between, pick } from '../environment/pick.js';
import { seeded, type Rng } from '../environment/seeded.js';
import { VOCAB } from './screen-lang.js';
import { generateFile } from './screen-codegen.js';
import { lineText } from './screen-tokens.js';
import { itemAt } from '../environment/checked.js';

/**
 * What a desk's terminal prints under a real command: invented lines in the style of that command's output. Real facts
 * are used where we have them (the branch, the files really edited, a port really open) and nothing here says how a
 * command ended: no check marks, no counts of passed or failed, no exit code. Progress is drawn as bars and dots.
 */
export type CommandKind =
  | 'install'
  | 'build'
  | 'test'
  | 'git-status'
  | 'git-log'
  | 'git-diff'
  | 'git-other'
  | 'docker'
  | 'kube'
  | 'list'
  | 'run'
  | 'generic';
export type Tone = 'text' | 'dim' | 'add' | 'del' | 'warn' | 'accent';
type TermLine = { text: string; tone: Tone };
export type TermContext = {
  branch: string | null;
  /** File base names the session really edited, newest last. */
  edited: readonly string[];
  /** Ports the session really has open. */
  ports: readonly number[];
  uncommitted: number;
};

const KINDS: [RegExp, CommandKind][] = [
  [/^git (status|st)\b/, 'git-status'],
  [/^git (log|reflog|blame)\b/, 'git-log'],
  [/^git (diff|show)\b/, 'git-diff'],
  [/^git\b/, 'git-other'],
  [/^docker\b|^podman\b/, 'docker'],
  [/^(kubectl|helm|k9s)\b/, 'kube'],
  [/^(pnpm|npm|yarn|bun) (i|install|add|ci)\b|^pip install|^poetry install/, 'install'],
  [/^(vitest|jest|pytest|playwright|mocha|tap)\b|\b(test|tests)$|^go test|^cargo test/, 'test'],
  [/\b(build|compile|tsc|make|bundle|lint|typecheck)\b|^cargo (check|build)|^go build/, 'build'],
  [/^(ls|cat|find|grep|rg|tree|head|tail|wc)\b/, 'list'],
  [
    /^(node|python3?|tsx|deno|ruby|java)\b|^(pnpm|npm|yarn) (run |start|dev)|^cargo run|^go run/,
    'run',
  ],
];

export function commandKind(head: string | null): CommandKind {
  return KINDS.find(([pattern]) => pattern.test(head ?? ''))?.[1] ?? 'generic';
}

const word = (r: Rng) => pick(r, VOCAB.nouns);
const hex = (r: Rng, n: number) =>
  Array.from({ length: n }, () => '0123456789abcdef'[Math.floor(r() * 16)]).join('');
const bar = (done: number, width = 24) =>
  `${'▓'.repeat(Math.round(done * width))}${'░'.repeat(width - Math.round(done * width))}`;
const file = (r: Rng, ext = 'ts') => `src/${word(r)}/${word(r)}-${word(r)}.${ext}`;
const t = (text: string, tone: Tone = 'text'): TermLine => ({ text, tone });

const MAKERS: Record<CommandKind, (r: Rng, c: TermContext, head: string, n: number) => TermLine[]> =
  {
    install: (r, _c, _h, n) =>
      Array.from({ length: n }, (_, i) =>
        i % 5 === 4
          ? t(`Progress ${bar(i / n)}`, 'accent')
          : t(
              `+ ${word(r)}-${word(r)} ${1 + Math.floor(r() * 9)}.${Math.floor(r() * 20)}.${Math.floor(r() * 9)}`,
              'dim',
            ),
      ),
    build: (r, _c, _h, n) =>
      Array.from({ length: n }, (_, i) =>
        i % 7 === 6
          ? t(`transforming ${bar(i / n, 16)}`, 'accent')
          : r() < 0.12
            ? t(`warning: ${pick(r, VOCAB.comments)}`, 'warn')
            : t(`compiling ${file(r, pick(r, ['ts', 'tsx', 'css']))}`, 'dim'),
      ),
    test: (r, _c, _h, n) =>
      Array.from({ length: n }, (_, i) =>
        i === 0
          ? t('RUN', 'accent')
          : i % 6 === 5
            ? t(`${bar(i / n, 20)}`, 'accent')
            : t(`· ${word(r)}-${word(r)}.test.ts`, 'dim'),
      ),
    'git-status': (_r, c) => [
      t(`On branch ${c.branch ?? 'main'}`),
      t(''),
      t('Changes not staged for commit:', 'warn'),
      ...(c.edited.length
        ? c.edited.slice(-6).map((f) => t(`        modified:   ${f}`, 'del'))
        : [t(`        ${c.uncommitted} files changed`, 'del')]),
      t(''),
      t(`no changes added to commit`, 'dim'),
    ],
    'git-log': (r, _c, _h, n) =>
      Array.from({ length: n }, () =>
        t(
          `${hex(r, 7)} ${pick(r, ['feat', 'fix', 'refactor', 'test', 'docs'])}: ${pick(r, VOCAB.verbs)} ${word(r)} ${word(r)}`,
          'text',
        ),
      ),
    'git-diff': (r, c, _h, n) => {
      const name = c.edited[c.edited.length - 1] ?? `${word(r)}.ts`;
      const code = generateFile('diff', name, 'ts', 40);
      const start = Math.floor(r() * 20);
      return [
        t(`diff --git a/${name} b/${name}`, 'dim'),
        t(`@@ -${start + 1},6 +${start + 1},9 @@`, 'accent'),
        ...Array.from({ length: n }, (_, i) => {
          const text = lineText(itemAt(code, (start + i) % code.length));
          return i % 4 === 1
            ? t(`-${text}`, 'del')
            : i % 4 === 2
              ? t(`+${text}`, 'add')
              : i % 4 === 3
                ? t(`+${text}`, 'add')
                : t(` ${text}`, 'dim');
        }),
      ];
    },
    'git-other': (r, c, _h, n) => [
      t('Enumerating objects...', 'dim'),
      t(`Writing objects ${bar(0.7, 18)}`, 'accent'),
      ...Array.from({ length: n }, () =>
        t(`${hex(r, 7)}..${hex(r, 7)}  ${c.branch ?? 'main'}`, 'dim'),
      ),
    ],
    docker: (r, _c, _h, n) =>
      Array.from({ length: n }, (_, i) =>
        i % 3 === 2
          ? t(`#${i + 1} ${bar(r(), 12)}`, 'accent')
          : t(
              `Step ${1 + (i % 9)}/9 : ${pick(r, ['RUN', 'COPY', 'FROM', 'WORKDIR'])} ${word(r)}`,
              'text',
            ),
      ),
    kube: (r, _c, _h, n) =>
      Array.from({ length: n }, () =>
        t(
          `pod/${word(r)}-${hex(r, 5)}   1/1   ${Math.floor(r() * 9)}   ${Math.floor(r() * 30)}m`,
          'text',
        ),
      ),
    list: (r, c, _h, n) => [
      ...c.edited.slice(-3).map((f) => t(f, 'accent')),
      ...Array.from({ length: n }, () => t(file(r), 'text')),
    ],
    run: (r, c, _h, n) => [
      t('starting...', 'dim'),
      ...(c.ports.length ? [t(`listening on :${c.ports[0]}`, 'accent')] : []),
      ...Array.from({ length: n }, () =>
        t(
          `[${String(Math.floor(r() * 24)).padStart(2, '0')}:${String(Math.floor(r() * 60)).padStart(2, '0')}] ${pick(r, VOCAB.verbs)} ${word(r)}`,
          'dim',
        ),
      ),
    ],
    generic: (r, _c, _h, n) =>
      Array.from({ length: n }, () => t(`${pick(r, VOCAB.verbs)} ${word(r)}...`, 'dim')),
  };

const STREAM = 80;
const cache = new Map<string, readonly TermLine[]>();

/** The first `count` lines of what `head` prints for this member, the same every time. */
export function terminalOutput(
  seed: string,
  head: string | null,
  context: TermContext,
  count: number,
): readonly TermLine[] {
  const key = `${seed}|${head}|${context.branch}|${context.edited.join(',')}|${context.ports.join(',')}|${context.uncommitted}`;
  let lines = cache.get(key);
  if (!lines) {
    const r = seeded(`${seed}|${head}`); // not the context: a changed count must not reshuffle the lines
    lines = MAKERS[commandKind(head)](r, context, head ?? '', STREAM);
    if (cache.size >= 24)
      for (const oldest of cache.keys()) {
        cache.delete(oldest);
        break;
      }
    cache.set(key, lines);
  }
  return lines.slice(0, count);
}

/** When each streamed line shows up, in ms after the command began: quick runs of lines, then a wait. */
const arrivalTimes = memoized(new Map<string, number[]>(), MEMO_LIMIT, (seed: string): number[] => {
  const r = seeded(`${seed}:stream`);
  const times: number[] = [];
  let at = between(r, 80, 400);
  while (times.length < STREAM) {
    for (let burst = 3 + Math.floor(r() * 6); burst > 0 && times.length < STREAM; burst--) {
      times.push(at);
      at += between(r, 40, 170);
    }
    at += between(r, 450, 1900);
  }
  return times;
});

/** How many lines of the stream a command has printed `ms` after it began. */
export function revealedLines(seed: string, ms: number): number {
  const times = arrivalTimes(seed);
  let n = 0;
  while (n < times.length && itemAt(times, n) <= ms) n++;
  return n;
}
