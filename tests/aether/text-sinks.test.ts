import { readdirSync, readFileSync, statSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import allowlist from './text-sinks.allowlist.json' with { type: 'json' };

/**
 * A guard on the text pipeline (docs/design-system.md, "Text pipeline"): text that comes from a session reaches the screen
 * only through the shared sanitizers, so a component that starts showing one of the known text fields has to say, in the
 * allowlist next to this file, which kind it is and why that is safe. A new use fails here until it is classified; an entry
 * nothing uses any more fails too, so the list stays true.
 */
const ROOTS = ['apps/web/src', 'packages/office-scene/src'];
const FIELD = /[A-Za-z_][A-Za-z0-9_?.]*\.(?:title|summary|prompt|reply|subject|topic|lastReply)\b/g;

/** What each kind of field is, and what makes it safe to print as it is. */
const KINDS: Record<string, string> = {
  'session-title':
    'a session title: `cleanTitle` on the server, normalized again by the web (local-session-compat)',
  'feed-reply': 'a reply preview: `toPlainPreview` in feed-model, plain text',
  'tool-target':
    'a tool call or approval target: redacted, cut, shown as text in code style, never as Markdown',
  'commit-subject':
    'a commit subject: plain text from the repository, React escapes it, never rendered as Markdown',
  'authored-title': 'a title someone typed into AETHER (a task, a note, a meeting): plain text',
  notice:
    'a notice produced by `structureWrappers`: tags gone, ids and paths dropped, redacted on the server',
};

const tsx = (dir: string): string[] =>
  readdirSync(dir).flatMap((name) => {
    const path = join(dir, name);
    if (statSync(path).isDirectory()) return name === 'node_modules' ? [] : tsx(path);
    return path.endsWith('.tsx') ? [path] : [];
  });

const files = ROOTS.flatMap(tsx);
const used = new Map<string, Set<string>>();
for (const file of files) {
  const found = new Set(readFileSync(file, 'utf8').match(FIELD) ?? []);
  if (found.size) used.set(file, found);
}
const listed = allowlist as Record<string, Record<string, string>>;

describe('text sinks', () => {
  it('classifies every use of a session-text field in a component', () => {
    const unlisted = [...used].flatMap(([file, exprs]) =>
      [...exprs].filter((e) => !listed[file]?.[e]).map((e) => `${file}: ${e}`),
    );
    expect(unlisted, 'add each to tests/aether/text-sinks.allowlist.json with its kind').toEqual(
      [],
    );
  });

  it('keeps the allowlist true: no entry for a use that is gone, and only known kinds', () => {
    const stale = Object.entries(listed).flatMap(([file, exprs]) =>
      Object.entries(exprs).flatMap(([expr, kind]) => [
        ...(used.get(file)?.has(expr) ? [] : [`${file}: ${expr} is not used`]),
        ...(KINDS[kind] ? [] : [`${file}: ${expr} has an unknown kind "${kind}"`]),
      ]),
    );
    expect(stale).toEqual([]);
  });

  it('never injects HTML', () => {
    const offenders = files.filter((f) =>
      /dangerouslySetInnerHTML|\.innerHTML\s*=/.test(readFileSync(f, 'utf8')),
    );
    expect(offenders).toEqual([]);
  });
});

describe('text sources', () => {
  const source = (file: string) => readFileSync(file, 'utf8');
  // Where session text enters the product, and the sanitizer each must use.
  const WIRING: [string, string][] = [
    ['apps/control/src/services/session-transcript.ts', 'structureWrappers'],
    ['apps/control/src/services/session-title.ts', 'cleanTitle'],
    ['apps/control/src/services/session-topic.ts', 'cleanTitle'],
    ['apps/control/src/services/subagent-text.ts', 'stripCliWrappers'],
    ['apps/web/src/features/feed-model.ts', 'toPlainPreview'],
    ['apps/web/src/features/md-parse.ts', 'parseMarkdown'],
    ['packages/kernel/src/text-title.ts', 'stripCliWrappers'],
  ];
  it.each(WIRING)('%s goes through %s', (file, sanitizer) => {
    expect(source(file)).toContain(sanitizer);
  });
});
