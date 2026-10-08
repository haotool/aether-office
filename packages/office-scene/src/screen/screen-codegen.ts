import { between, pick, weighted } from '../environment/pick.js';
import { seeded } from '../environment/seeded.js';
import { VOCAB, type LangId } from './screen-lang.js';
import { generateData } from './screen-codegen-data.js';
import { GO, JAVA, JS, RS, TS, list, type Dialect } from './screen-dialects.js';
import {
  BLANK,
  com,
  fn,
  id,
  kw,
  line,
  lineText,
  nameParts,
  num,
  pun,
  snake,
  str,
  ty,
  wordsOf,
  type CodeLine,
  type CodeToken,
  type Names,
} from './screen-tokens.js';

export { lineText, type CodeLine, type CodeToken, type TokenKind } from './screen-tokens.js';

/**
 * Plausible code for a desk's editor: made up, never read from anything. A real file's name and extension seed it (its
 * words become the identifiers, its extension the language); the rest is a small grammar per language that keeps
 * brackets balanced and indentation regular. The same (seed, file, language) always gives the same lines.
 */
const MAX_WIDTH = 86;

/** An expression: a literal, a name or, at the top, a call whose arguments are plain. */
function expr(d: Dialect, n: Names, top: boolean, call = false): CodeToken[] {
  const kind = call
    ? 'call'
    : weighted(n.r, { id: 4, call: top ? 4 : 0, str: 2, num: 2, sum: top ? 1 : 0 });
  if (kind === 'id') return [id(d.varCase(nameParts(n, false)))];
  if (kind === 'str') return [str(`${d.quote}${pick(n.r, VOCAB.nouns)}${d.quote}`)];
  if (kind === 'num') return [num(String(Math.floor(between(n.r, 1, 500))))];
  if (kind === 'sum')
    return [id(d.varCase(nameParts(n, false))), pun(' + '), num(String(1 + Math.floor(n.r() * 9)))];
  const name = fn(d.fnCase(nameParts(n, true)));
  const out: CodeToken[] = [...(d.await && n.r() < 0.3 ? [kw('await ')] : []), name, pun('(')];
  for (let i = Math.floor(n.r() * 3); i > 0; i--) {
    out.push(...expr(d, n, false));
    if (i > 1) out.push(pun(', '));
  }
  return [...out, pun(')')];
}

function condition(d: Dialect, n: Names): CodeToken[] {
  const right = n.r() < 0.5 ? kw(d.nullish) : num(String(Math.floor(n.r() * 20)));
  return [id(d.varCase(nameParts(n, false))), pun(` ${pick(n.r, [d.eq, '!=', '>', '<'])} `), right];
}

/** Adds a line, or a comment in its place when it came out too wide to look like code. */
function emit(out: CodeLine[], l: CodeLine): void {
  out.push(lineText(l).length > MAX_WIDTH ? line(l.indent, com('// ...')) : l);
}

function statement(d: Dialect, n: Names, depth: number, out: CodeLine[], nest: number): void {
  const kind = weighted(n.r, {
    decl: 5,
    call: 3,
    comment: 1.5,
    if: nest < 2 ? 2 : 0,
    loop: nest < 2 ? 1.2 : 0,
  });
  if (kind === 'decl')
    emit(out, line(depth, ...d.decl(d.varCase(nameParts(n, false)), expr(d, n, true))));
  else if (kind === 'call') emit(out, line(depth, ...expr(d, n, true, true), pun(d.semi)));
  else if (kind === 'comment')
    out.push(line(depth, com(`${d.comment} ${pick(n.r, VOCAB.comments)}`)));
  else {
    const open =
      kind === 'if'
        ? d.ifOpen(condition(d, n))
        : d.forOpen(d.varCase([pick(n.r, VOCAB.nouns)]), d.varCase(nameParts(n, false)));
    out.push(line(depth, ...open)); // never swapped for a comment: its closing brace is coming
    for (let i = 1 + Math.floor(n.r() * 3); i > 0; i--) statement(d, n, depth + 1, out, nest + 1);
    if (kind === 'if' && n.r() < 0.3) {
      out.push(line(depth, pun('}'), kw(' else '), pun('{')));
      for (let i = 1 + Math.floor(n.r() * 2); i > 0; i--) statement(d, n, depth + 1, out, nest + 1);
    }
    out.push(line(depth, pun('}')));
  }
}

function braceFile(d: Dialect, n: Names, total: number): CodeLine[] {
  const out: CodeLine[] = [...d.header(n), BLANK];
  const outer = d.wrap ? 1 : 0;
  if (d.wrap) out.push(line(0, kw('public class '), ty(d.wrap(n)), pun(' {')));
  for (let first = true; out.length < total; first = false) {
    const name = d.fnCase(first ? [pick(n.r, VOCAB.verbs), ...n.stem] : nameParts(n, true));
    const args = Array.from({ length: Math.floor(n.r() * 3) }, () =>
      d.varCase(nameParts(n, false)),
    );
    let open = d.fnOpen(name, args, n);
    if (lineText(line(outer, ...open)).length > MAX_WIDTH) open = d.fnOpen(name, [], n);
    out.push(line(outer, ...open));
    for (let i = 2 + Math.floor(n.r() * 4); i > 0; i--) statement(d, n, outer + 1, out, 0);
    emit(out, line(outer + 1, ...d.ret(expr(d, n, true))));
    out.push(line(outer, pun('}')), BLANK);
  }
  if (d.wrap) out.push(line(0, pun('}')));
  return out;
}

const PY_BODY: ((n: Names) => CodeToken[])[] = [
  (n) => [
    id(snake(nameParts(n, false))),
    pun(' = '),
    fn(snake(nameParts(n, true))),
    pun('('),
    id(snake(nameParts(n, false))),
    pun(')'),
  ],
  (n) => [
    fn(snake(nameParts(n, true))),
    pun('('),
    id(snake(nameParts(n, false))),
    pun(', '),
    num(String(1 + Math.floor(n.r() * 99))),
    pun(')'),
  ],
  (n) => [
    id(snake(nameParts(n, false))),
    pun(' = ['),
    id('x'),
    kw(' for '),
    id('x'),
    kw(' in '),
    id(snake(nameParts(n, false))),
    kw(' if '),
    id('x'),
    pun(']'),
  ],
  (n) => [
    id(snake(nameParts(n, false))),
    pun('['),
    str(`"${pick(n.r, VOCAB.nouns)}"`),
    pun('] = '),
    num(String(Math.floor(n.r() * 50))),
  ],
];

function pythonFile(n: Names, total: number): CodeLine[] {
  const out: CodeLine[] = [
    line(0, kw('import '), id('os')),
    line(0, kw('from '), id(snake(n.stem)), kw(' import '), id(snake(nameParts(n, false)))),
    BLANK,
  ];
  const stmt = () => pick(n.r, PY_BODY)(n);
  for (let first = true; out.length < total; first = false) {
    const args = Array.from({ length: Math.floor(n.r() * 3) }, () => snake(nameParts(n, false)));
    const name = snake(first ? [pick(n.r, VOCAB.verbs), ...n.stem] : nameParts(n, true));
    out.push(line(0, kw('def '), fn(name), pun('('), ...list(args.map((a) => [id(a)])), pun('):')));
    if (n.r() < 0.4) out.push(line(1, com(`# ${pick(n.r, VOCAB.comments)}`)));
    for (let i = 2 + Math.floor(n.r() * 4); i > 0; i--) {
      const roll = n.r();
      if (roll < 0.3) {
        out.push(
          line(1, kw('if '), id(snake(nameParts(n, false))), kw(' is not '), kw('None'), pun(':')),
        );
        out.push(line(2, ...stmt()));
      } else if (roll < 0.45) {
        out.push(
          line(1, kw('for '), id('item'), kw(' in '), id(snake(nameParts(n, false))), pun(':')),
        );
        out.push(line(2, ...stmt()));
      } else out.push(line(1, ...stmt()));
    }
    out.push(line(1, kw('return '), id(snake(nameParts(n, false)))), BLANK, BLANK);
  }
  return out;
}

const cache = new Map<string, readonly CodeLine[]>();
const CACHE_LIMIT = 32;

/** About `total` lines of code for `file` (whose words seed the names) in `lang`, balanced and indented. */
export function generateFile(
  seed: string,
  file: string,
  lang: LangId,
  total = 72,
): readonly CodeLine[] {
  const key = `${seed}|${file}|${lang}|${total}`;
  const hit = cache.get(key);
  if (hit) return hit;
  const n: Names = { stem: wordsOf(file), r: seeded(key) };
  const dialects = { ts: TS, tsx: TS, js: JS, go: GO, rs: RS, java: JAVA } as const;
  const lines =
    lang === 'py'
      ? pythonFile(n, total)
      : lang in dialects
        ? braceFile(dialects[lang as keyof typeof dialects], n, total)
        : generateData(lang, n, total);
  if (cache.size >= CACHE_LIMIT)
    for (const oldest of cache.keys()) {
      cache.delete(oldest);
      break;
    }
  cache.set(key, lines);
  return lines;
}
