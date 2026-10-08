// Small helpers shared by the area modules.
import { PRODUCT_SOURCE } from './repo.mjs';

/** The scorer's own files describe the patterns they look for, so they are never scanned. */
export const SELF = /^(scripts\/quality\/|tests\/aether\/quality-|docs\/quality\/)/;

/** CHARTER D9: fan-in ignores test support modules as violation targets. */
export const FAN_IN_SUPPORT = /^(?:tests\/|e2e\/support\/)/;

export function fanInExcludedTarget(file) {
  return FAN_IN_SUPPORT.test(file);
}

export const isSourceFile = (file) => PRODUCT_SOURCE.test(file) || /^scripts\/.*\.ts$/.test(file);

export const at = (file, line, message = '') => `${file}:${line}${message ? ` ${message}` : ''}`;

/** Lines of `text` matching `pattern` as { line, text } (1-based). */
export function grepLines(text, pattern) {
  const hits = [];
  text.split('\n').forEach((content, i) => {
    if (pattern.test(content)) hits.push({ line: i + 1, text: content.trim() });
  });
  return hits;
}

/** Runs `pattern` over every file in `files`, returning `file:line text` strings. */
export function scan(
  repo,
  files,
  pattern,
  { skip = SELF, say = (hit) => hit.text.slice(0, 80) } = {},
) {
  return files
    .filter((file) => !skip.test(file))
    .flatMap((file) =>
      grepLines(repo.read(file), pattern).map((hit) => at(file, hit.line, say(hit))),
    );
}

/** The per-line locations of facts such as `any`: [{file, lines}] to `file:line` strings. */
export const locations = (facts, key) =>
  facts.flatMap((f) => f[key].map((line) => at(f.file, line)));

/** Truncates a long detail list for the report; the JSON keeps the first `limit` entries. */
export const top = (list, limit = 40) =>
  list.length > limit ? [...list.slice(0, limit), `... ${list.length - limit} more`] : list;

/** "fail: file:12 rule note sample" from the readiness check, reduced to "file:12 rule": samples can hold the very data found. */
export const findingLocation = (line) => line.replace(/^(?:fail|warn): (\S+) (\S+).*$/, '$1 $2');
