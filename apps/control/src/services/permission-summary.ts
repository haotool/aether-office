import { redactSecrets, redactStructured } from './redaction.js';

export const SUMMARY_CHARS = 140;
export const PREVIEW_CHARS = 1200;

const isObject = (v: unknown): v is Record<string, unknown> =>
  typeof v === 'object' && v !== null && !Array.isArray(v);
const str = (v: unknown) => (typeof v === 'string' ? v : '');
// Controls other than newline and tab, C1 controls (NEL...), soft hyphen, zero-width characters and bidirectional
// overrides and isolates: none of them can reorder or hide what a person reads before pressing Allow.
const HIDDEN =
  // eslint-disable-next-line no-control-regex
  /[\u0000-\u0008\u000b\u000c\u000e-\u001f\u007f-\u009f­؜​-‏‪-‮⁠-⁤⁦-⁩﻿]/g;
/** Hidden characters go first (one inside a secret must not defeat redaction), then secrets, so a cut never leaves half of one. */
const clean = (v: string) => redactSecrets(v.replace(/\r\n?/g, '\n').replace(HIDDEN, ''));
export const cut = (v: string, max: number) => (v.length > max ? `${v.slice(0, max - 1)}…` : v);
const oneLine = (v: string) => !v.includes('\n') && v.length <= SUMMARY_CHARS;
const lines = (prefix: string, text: string) =>
  text
    .split('\n')
    .map((l) => `${prefix} ${l}`)
    .join('\n');

/** One edit as a small diff, flagged when it replaces every occurrence; `of` is set when there are several edits. */
function editBlock(
  edit: Record<string, unknown>,
  of: { n: number; total: number } | null,
  side: number,
) {
  const before = clean(str(edit['old_string']));
  const after = clean(str(edit['new_string'] ?? edit['new_source']));
  const flag = edit['replace_all'] === true ? 'replace all' : '';
  const head = of ? `# edit ${of.n}/${of.total}${flag ? ` (${flag})` : ''}` : flag && `(${flag})`;
  const body = [before && lines('-', cut(before, side)), after && lines('+', cut(after, side))];
  return before || after ? [head, ...body].filter(Boolean).join('\n') : '';
}

function fileChange(o: Record<string, unknown>, path: string) {
  const edits = Array.isArray(o['edits']) ? o['edits'].filter(isObject) : [];
  const files = [path, ...edits.map((e) => clean(str(e['file_path'])))].filter(Boolean);
  const summary = `${[...new Set(files)].join(', ')}${edits.length > 1 ? ` (+${edits.length - 1} edits)` : ''}`;
  const side = Math.max(80, Math.floor(PREVIEW_CHARS / (2 * Math.max(1, edits.length))));
  const blocks = (edits.length ? edits : [o]).map((e, i, all) =>
    editBlock(e, all.length > 1 ? { n: i + 1, total: all.length } : null, side),
  );
  const content = clean(str(o['content']));
  const diff = blocks.filter(Boolean).join('\n');
  return { summary, preview: diff || (content ? lines('+', cut(content, PREVIEW_CHARS)) : null) };
}

/**
 * Pure. What a person sees of a tool call they are asked to allow: a one-line summary and a bounded preview (the
 * command, or the change as a small diff). Redacted and truncated here, so the raw input is never stored or sent on.
 * `needsReview` is true whenever the summary line is not the whole call, so a compact view cannot offer Allow for it.
 */
export function summarize(
  tool: string,
  input: unknown,
): { summary: string; preview: string | null; needsReview: boolean } {
  const o = isObject(input) ? input : {};
  const path = clean(str(o['file_path'] ?? o['notebook_path']));
  const command = clean(str(o['command']));
  let preview: string | null = null;
  let summary = tool;
  let whole = false;
  if (command) {
    summary = command.split('\n')[0] ?? command;
    // The command first: the agent's own description of it must not push the command out of sight.
    preview = [command, clean(str(o['description']))].filter(Boolean).join('\n');
    whole = oneLine(command);
  } else if (path) {
    ({ summary, preview } = fileChange(o, path));
    whole = preview === null && oneLine(summary);
  } else if (typeof o['url'] === 'string') {
    summary = clean(o['url']);
    whole = oneLine(summary);
  } else if (Object.keys(o).length) {
    preview = clean(JSON.stringify(redactStructured(o)));
  } else whole = true;
  return {
    summary: cut(summary, SUMMARY_CHARS),
    preview: preview ? cut(preview, PREVIEW_CHARS) : null,
    needsReview: !whole,
  };
}
