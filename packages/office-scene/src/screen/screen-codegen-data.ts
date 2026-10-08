import { pick } from '../environment/pick.js';
import { VOCAB, type LangId } from './screen-lang.js';
import {
  BLANK,
  camel,
  com,
  fn,
  id,
  kw,
  line,
  nameParts,
  num,
  pun,
  snake,
  str,
  tx,
  ty,
  type CodeLine,
  type CodeToken,
  type Names,
} from './screen-tokens.js';
import { lastOf } from '../environment/checked.js';

/** Generators for the languages that are not statements in braces: stylesheets, data files, SQL, shell and prose. */
const word = (n: Names) => pick(n.r, VOCAB.nouns);
const sentence = (n: Names) =>
  Array.from({ length: 4 + Math.floor(n.r() * 6) }, () =>
    n.r() < 0.3 ? pick(n.r, VOCAB.verbs) : word(n),
  ).join(' ');

function css(n: Names, total: number): CodeLine[] {
  const out: CodeLine[] = [line(0, com('/* ' + n.stem.join(' ') + ' */')), BLANK];
  const px = () => [num(`${4 + Math.floor(n.r() * 28)}px`)];
  const token = () => [id('var'), pun('('), id(`--${word(n)}`), pun(')')];
  const declarations: (() => [string, CodeToken[]])[] = [
    () => ['color', token()],
    () => ['gap', px()],
    () => ['display', [kw(pick(n.r, ['flex', 'grid', 'block', 'none']))]],
    () => ['opacity', [num(`0.${1 + Math.floor(n.r() * 9)}`)]],
    () => ['padding', px()],
    () => ['margin', px()],
    () => ['width', [num(`${10 + Math.floor(n.r() * 90)}%`)]],
    () => ['border-radius', px()],
    () => ['background', token()],
  ];
  while (out.length < total) {
    out.push(line(0, fn(`.${n.stem.join('-')}__${word(n)}`), pun(' {')));
    for (let i = 2 + Math.floor(n.r() * 4); i > 0; i--) {
      const [property, value] = pick(n.r, declarations)();
      out.push(line(1, id(property), pun(': '), ...value, pun(';')));
    }
    out.push(line(0, pun('}')), BLANK);
  }
  return out;
}

function json(n: Names, total: number): CodeLine[] {
  const out: CodeLine[] = [line(0, pun('{'))];
  const entries: CodeLine[][] = [];
  while (out.length + entries.flat().length < total - 2) {
    const key = str(`"${snake(nameParts(n, false))}"`);
    const roll = n.r();
    if (roll < 0.4)
      entries.push([line(1, key, pun(': '), str(`"${word(n)}-${sentence(n).split(' ')[0]}"`))]);
    else if (roll < 0.6)
      entries.push([line(1, key, pun(': '), num(String(Math.floor(n.r() * 900))))]);
    else if (roll < 0.8)
      entries.push([line(1, key, pun(': '), kw(n.r() < 0.5 ? 'true' : 'false'))]);
    else
      entries.push([
        line(1, key, pun(': {')),
        line(2, str(`"${word(n)}"`), pun(': '), str(`"${word(n)}"`), pun(',')),
        line(2, str(`"${word(n)}"`), pun(': '), num(String(Math.floor(n.r() * 90)))),
        line(1, pun('}')),
      ]);
  }
  entries.forEach((entry, i) => {
    const last = lastOf(entry);
    const comma = i < entries.length - 1 ? [pun(',')] : [];
    out.push(...entry.slice(0, -1), { ...last, tokens: [...last.tokens, ...comma] });
  });
  out.push(line(0, pun('}')));
  return out;
}

function yaml(n: Names, total: number): CodeLine[] {
  const out: CodeLine[] = [line(0, com(`# ${n.stem.join(' ')}`))];
  while (out.length < total) {
    out.push(line(0, id(`${snake(nameParts(n, false))}`), pun(':')));
    for (let i = 2 + Math.floor(n.r() * 3); i > 0; i--) {
      if (n.r() < 0.35) {
        out.push(line(1, id(word(n)), pun(':')));
        for (let k = 1 + Math.floor(n.r() * 3); k > 0; k--)
          out.push(line(2, pun('- '), str(`${word(n)}-${pick(n.r, VOCAB.verbs)}`)));
      } else
        out.push(
          line(
            1,
            id(word(n)),
            pun(': '),
            n.r() < 0.5 ? num(String(Math.floor(n.r() * 600))) : str(word(n)),
          ),
        );
    }
    out.push(BLANK);
  }
  return out;
}

function sql(n: Names, total: number): CodeLine[] {
  const out: CodeLine[] = [line(0, com(`-- ${n.stem.join(' ')}`)), BLANK];
  const table = () => `${snake(n.stem)}_${word(n)}`;
  while (out.length < total) {
    if (n.r() < 0.35) {
      out.push(line(0, kw('CREATE TABLE '), ty(table()), pun(' (')));
      const cols = 2 + Math.floor(n.r() * 3);
      for (let i = 0; i < cols; i++)
        out.push(
          line(
            1,
            id(snake(nameParts(n, false))),
            tx(' '),
            ty(pick(n.r, ['text', 'integer', 'boolean', 'timestamp'])),
            pun(i < cols - 1 ? ',' : ''),
          ),
        );
      out.push(line(0, pun(');')), BLANK);
    } else {
      out.push(line(0, kw('SELECT '), id(word(n)), pun(', '), id(word(n))));
      out.push(line(1, kw('FROM '), ty(table())));
      if (n.r() < 0.6)
        out.push(
          line(1, kw('WHERE '), id(word(n)), pun(' > '), num(String(Math.floor(n.r() * 100)))),
        );
      out.push(line(1, kw('ORDER BY '), id(word(n)), pun(';')), BLANK);
    }
  }
  return out;
}

function shell(n: Names, total: number): CodeLine[] {
  const out: CodeLine[] = [
    line(0, com('#!/usr/bin/env bash')),
    line(0, kw('set '), id('-euo pipefail')),
    BLANK,
  ];
  while (out.length < total) {
    const roll = n.r();
    if (roll < 0.3)
      out.push(
        line(0, id(snake(nameParts(n, false)).toUpperCase()), pun('='), str(`"${word(n)}"`)),
      );
    else if (roll < 0.55) {
      out.push(
        line(
          0,
          kw('if '),
          pun('[ '),
          id('-f'),
          tx(' '),
          str(`"$${snake(nameParts(n, false)).toUpperCase()}"`),
          pun(' ]; '),
          kw('then'),
        ),
      );
      out.push(line(1, fn('echo'), tx(' '), str(`"${sentence(n)}"`)));
      out.push(line(0, kw('fi')));
    } else if (roll < 0.75) out.push(line(0, com(`# ${pick(n.r, VOCAB.comments)}`)));
    else
      out.push(
        line(
          0,
          fn(pick(n.r, ['pnpm', 'git', 'curl', 'mkdir', 'cp'])),
          tx(' '),
          id(`${pick(n.r, ['-p', '-f', '--quiet'])} ${word(n)}`),
        ),
      );
  }
  return out;
}

function markdown(n: Names, total: number): CodeLine[] {
  const out: CodeLine[] = [line(0, kw('# '), tx(n.stem.join(' '))), BLANK];
  while (out.length < total) {
    const roll = n.r();
    if (roll < 0.25)
      out.push(line(0, kw('## '), tx(`${pick(n.r, VOCAB.verbs)} ${word(n)}`)), BLANK);
    else if (roll < 0.6) out.push(line(0, tx(sentence(n))), BLANK);
    else if (roll < 0.85)
      for (let i = 2 + Math.floor(n.r() * 3); i > 0; i--)
        out.push(line(0, pun('- '), tx(sentence(n))));
    else
      out.push(
        line(0, com('```')),
        line(0, id(`${camel(nameParts(n, true))}()`)),
        line(0, com('```')),
        BLANK,
      );
  }
  return out;
}

const GENERATORS: Partial<Record<LangId, (n: Names, total: number) => CodeLine[]>> = {
  css,
  json,
  yaml,
  sql,
  sh: shell,
  md: markdown,
};

export function generateData(lang: LangId, n: Names, total: number): CodeLine[] {
  const generate = GENERATORS[lang];
  if (!generate) throw new RangeError(`no data generator for ${lang}`);
  return generate(n, total);
}
