import { pick } from './pick.js';
import { VOCAB } from './screen-lang.js';
import {
  BLANK,
  camel,
  fn,
  id,
  kw,
  line,
  nameParts,
  pascal,
  pun,
  snake,
  str,
  tx,
  ty,
  type CodeLine,
  type CodeToken,
  type Names,
} from './screen-tokens.js';

/** How one language writes its statements: the pieces screen-codegen.ts puts together into a file. */
export type Dialect = {
  semi: string;
  nullish: string;
  eq: string;
  quote: string;
  await: boolean;
  comment: string;
  fnCase: (ws: string[]) => string;
  varCase: (ws: string[]) => string;
  header: (n: Names) => CodeLine[];
  fnOpen: (name: string, args: string[], n: Names) => CodeToken[];
  decl: (name: string, value: CodeToken[]) => CodeToken[];
  ret: (value: CodeToken[]) => CodeToken[];
  ifOpen: (cond: CodeToken[]) => CodeToken[];
  forOpen: (item: string, coll: string) => CodeToken[];
  wrap?: (n: Names) => string;
};

const PARAM_TYPES = ['string', 'number', 'boolean', 'Config', 'Entry'];
export const list = (items: CodeToken[][]): CodeToken[] =>
  items.flatMap((tokens, i) => [...(i ? [pun(', ')] : []), ...tokens]);

export const TS: Dialect = {
  semi: ';',
  nullish: 'null',
  eq: '===',
  quote: "'",
  await: true,
  comment: '//',
  fnCase: camel,
  varCase: camel,
  header: (n) => [
    line(
      0,
      kw('import '),
      pun('{ '),
      id(camel([pick(n.r, VOCAB.verbs), ...n.stem])),
      pun(' }'),
      kw(' from '),
      str(`'./${n.stem.join('-')}-${pick(n.r, VOCAB.nouns)}.js'`),
      pun(';'),
    ),
    line(
      0,
      kw('import type '),
      pun('{ '),
      ty(pascal(nameParts(n, false))),
      pun(' }'),
      kw(' from '),
      str("'./types.js'"),
      pun(';'),
    ),
  ],
  fnOpen: (name, args, n) => [
    kw('export '),
    ...(n.r() < 0.3 ? [kw('async ')] : []),
    kw('function '),
    fn(name),
    pun('('),
    ...list(args.map((a) => [id(a), pun(': '), ty(pick(n.r, PARAM_TYPES))])),
    pun('): '),
    ty(pick(n.r, VOCAB.types)),
    pun(' {'),
  ],
  decl: (name, value) => [kw('const '), id(name), pun(' = '), ...value, pun(';')],
  ret: (value) => [kw('return '), ...value, pun(';')],
  ifOpen: (cond) => [kw('if '), pun('('), ...cond, pun(') {')],
  forOpen: (item, coll) => [
    kw('for '),
    pun('('),
    kw('const '),
    id(item),
    kw(' of '),
    id(coll),
    pun(') {'),
  ],
};

export const JS: Dialect = {
  ...TS,
  header: (n) => [
    line(
      0,
      kw('import '),
      pun('{ '),
      id(camel([pick(n.r, VOCAB.verbs), ...n.stem])),
      pun(' }'),
      kw(' from '),
      str(`'./${n.stem.join('-')}.js'`),
      pun(';'),
    ),
  ],
  fnOpen: (name, args) => [
    kw('export '),
    kw('function '),
    fn(name),
    pun('('),
    ...list(args.map((a) => [id(a)])),
    pun(') {'),
  ],
};

export const GO: Dialect = {
  semi: '',
  nullish: 'nil',
  eq: '==',
  quote: '"',
  await: false,
  comment: '//',
  fnCase: pascal,
  varCase: camel,
  header: (n) => [
    line(0, kw('package '), id(n.stem[0]?.replace(/[^a-z]/g, '') || 'main')),
    BLANK,
    line(0, kw('import '), pun('(')),
    line(1, str('"context"')),
    line(1, str('"fmt"')),
    line(0, pun(')')),
  ],
  fnOpen: (name, args, n) => [
    kw('func '),
    fn(name),
    pun('('),
    ...list(args.map((a) => [id(a), tx(' '), ty(pick(n.r, ['int', 'string', 'bool']))])),
    pun(') '),
    ty('error'),
    pun(' {'),
  ],
  decl: (name, value) => [id(name), pun(' := '), ...value],
  ret: () => [kw('return '), kw('nil')],
  ifOpen: (cond) => [kw('if '), ...cond, pun(' {')],
  forOpen: (item, coll) => [
    kw('for '),
    id('_'),
    pun(', '),
    id(item),
    pun(' := '),
    kw('range '),
    id(coll),
    pun(' {'),
  ],
};

export const RS: Dialect = {
  semi: ';',
  nullish: 'None',
  eq: '==',
  quote: '"',
  await: false,
  comment: '//',
  fnCase: snake,
  varCase: snake,
  header: (n) => [
    line(0, kw('use '), id('std::collections::HashMap'), pun(';')),
    line(
      0,
      kw('use '),
      id(`crate::${snake(n.stem)}::`),
      pun('{'),
      ty(pascal(nameParts(n, false))),
      pun('};'),
    ),
  ],
  fnOpen: (name, args, n) => [
    kw('pub fn '),
    fn(name),
    pun('('),
    ...list(
      args.map((a) => [id(a), pun(': '), ty(pick(n.r, ['&str', 'usize', 'bool', '&Config']))]),
    ),
    pun(') -> '),
    ty('Result<()>'),
    pun(' {'),
  ],
  decl: (name, value) => [kw('let '), id(name), pun(' = '), ...value, pun(';')],
  ret: () => [fn('Ok'), pun('(())')],
  ifOpen: (cond) => [kw('if '), ...cond, pun(' {')],
  forOpen: (item, coll) => [
    kw('for '),
    id(item),
    kw(' in '),
    id(coll),
    pun('.'),
    fn('iter'),
    pun('() {'),
  ],
};

export const JAVA: Dialect = {
  semi: ';',
  nullish: 'null',
  eq: '==',
  quote: '"',
  await: false,
  comment: '//',
  fnCase: camel,
  varCase: camel,
  header: (n) => [
    line(0, kw('package '), id(`app.${n.stem[0]?.replace(/[^a-z]/g, '') || 'main'}`), pun(';')),
    line(0, kw('import '), id('java.util.List'), pun(';')),
  ],
  fnOpen: (name, args, n) => [
    kw('public '),
    ty(pick(n.r, ['void', 'int', 'String', 'boolean'])),
    tx(' '),
    fn(name),
    pun('('),
    ...list(args.map((a) => [ty(pick(n.r, ['int', 'String', 'long'])), tx(' '), id(a)])),
    pun(') {'),
  ],
  decl: (name, value) => [ty('var '), id(name), pun(' = '), ...value, pun(';')],
  ret: (value) => [kw('return '), ...value, pun(';')],
  ifOpen: (cond) => [kw('if '), pun('('), ...cond, pun(') {')],
  forOpen: (item, coll) => [
    kw('for '),
    pun('('),
    ty('var '),
    id(item),
    pun(' : '),
    id(coll),
    pun(') {'),
  ],
  wrap: (n) => pascal(n.stem),
};
