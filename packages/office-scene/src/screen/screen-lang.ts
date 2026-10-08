import { weighted } from '../environment/pick.js';
import { type Rng } from '../environment/seeded.js';

/** The languages a desk's code view can draw. The real file's extension decides; nothing else does. */
export const LANGUAGES = [
  'ts',
  'tsx',
  'js',
  'py',
  'go',
  'rs',
  'java',
  'css',
  'md',
  'json',
  'yaml',
  'sql',
  'sh',
] as const;
export type LangId = (typeof LANGUAGES)[number];

const EXTENSIONS: Record<string, LangId> = {
  ts: 'ts',
  mts: 'ts',
  cts: 'ts',
  tsx: 'tsx',
  js: 'js',
  jsx: 'js',
  mjs: 'js',
  cjs: 'js',
  py: 'py',
  go: 'go',
  rs: 'rs',
  java: 'java',
  kt: 'java',
  css: 'css',
  scss: 'css',
  md: 'md',
  mdx: 'md',
  json: 'json',
  yml: 'yaml',
  yaml: 'yaml',
  sql: 'sql',
  sh: 'sh',
  bash: 'sh',
  zsh: 'sh',
};

/** The language of a real file name, or null when its extension is not one we draw (or it has none). */
export function languageOf(file: string | null): LangId | null {
  const ext = file?.split('.').pop()?.toLowerCase();
  return ext && file?.includes('.') ? (EXTENSIONS[ext] ?? null) : null;
}

/** What a role writes when the real file says nothing (a call without a target): weights, not facts. */
const ROLE_LANGUAGE_WEIGHTS: Record<string, Partial<Record<LangId, number>>> = {
  frontend: { tsx: 5, ts: 3, css: 2 },
  backend: { ts: 3, go: 3, java: 2, py: 2, sql: 1 },
  fullstack: { ts: 4, tsx: 3, sql: 1, js: 1 },
  mobile: { ts: 3, java: 3, js: 1 },
  platform: { yaml: 4, sh: 3, go: 2 },
  sre: { yaml: 3, sh: 3, go: 2, py: 1 },
  release: { yaml: 3, sh: 3, json: 2 },
  data: { py: 5, sql: 4 },
  ml: { py: 8, yaml: 1 },
  analytics: { sql: 5, py: 4 },
  docs: { md: 8, json: 1 },
  research: { md: 5, py: 2 },
  'product-manager': { md: 6, json: 1 },
  security: { go: 2, py: 2, rs: 2, ts: 2 },
};
const DEFAULT_WEIGHTS: Partial<Record<LangId, number>> = {
  ts: 5,
  tsx: 2,
  py: 3,
  go: 2,
  rs: 1,
  js: 1,
};

/** A language for a desk whose file is unknown, from its role's habits. */
export function fallbackLanguage(role: string, r: Rng): LangId {
  return weighted(r, (ROLE_LANGUAGE_WEIGHTS[role] ?? DEFAULT_WEIGHTS) as Record<LangId, number>);
}

/** Words a file's code draws on besides the real file's own name: verbs and nouns of ordinary software. */
export const VOCAB = {
  verbs: [
    'load',
    'parse',
    'build',
    'merge',
    'resolve',
    'render',
    'fetch',
    'update',
    'check',
    'handle',
    'apply',
    'flush',
  ],
  nouns: [
    'state',
    'config',
    'cache',
    'queue',
    'token',
    'index',
    'items',
    'result',
    'options',
    'session',
    'entry',
    'batch',
    'node',
    'event',
  ],
  types: [
    'string',
    'number',
    'boolean',
    'Config',
    'Result',
    'Options',
    'Entry',
    'State',
    'Promise<void>',
  ],
  comments: [
    'keep the order stable',
    'skip entries that are already handled',
    'fall back to the default',
    'guard against an empty list',
    'retry once before giving up',
    'normalize before comparing',
    'cheap check first',
    'release the lock on every path',
  ],
} as const;

/** Display names for the status bar. */
export const LANGUAGE_NAME: Record<LangId, string> = {
  ts: 'TypeScript',
  tsx: 'TypeScript React',
  js: 'JavaScript',
  py: 'Python',
  go: 'Go',
  rs: 'Rust',
  java: 'Java',
  css: 'CSS',
  md: 'Markdown',
  json: 'JSON',
  yaml: 'YAML',
  sql: 'SQL',
  sh: 'Shell',
};
