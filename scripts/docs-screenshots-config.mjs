// Command-line options and limits of the documentation screenshots (scripts/docs-screenshots.mjs).
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

export const root = resolve(dirname(fileURLToPath(import.meta.url)), '..');
export const flag = (name) => {
  const at = process.argv.indexOf(`--${name}`);
  if (at < 0) return undefined;
  const next = process.argv[at + 1];
  return next === undefined || next.startsWith('--') ? true : next;
};
export const port = Number(flag('port') ?? 4511);
export const out = resolve(String(flag('out') ?? join(root, 'docs/images')));
export const only = typeof flag('only') === 'string' ? String(flag('only')).split(',') : null;
export const MAX_BYTES = 250 * 1024;
export const LAN = '192.168.1.20';
