import { execFileSync } from 'node:child_process';
import { realpathSync } from 'node:fs';

export const SUBJECT_MAX = 72;
export const CLONE_MARKER = 'oss-throwaway-clone.json';
export const CONVENTIONAL_TYPES = [
  'feat',
  'fix',
  'refactor',
  'perf',
  'docs',
  'test',
  'chore',
  'ci',
  'build',
  'style',
  'revert',
];
const PREFIX = new RegExp(`^(${CONVENTIONAL_TYPES.join('|')})(\\([a-z0-9,/._-]+\\))?!?: (?=\\S)`);

export function git(repo, args, options = {}) {
  return execFileSync('git', ['-C', repo, ...args], {
    encoding: 'utf8',
    maxBuffer: 1 << 30,
    stdio: ['pipe', 'pipe', 'pipe'],
    ...options,
  });
}

export function toplevel(dir) {
  try {
    return realpathSync(
      execFileSync('git', ['-C', dir, 'rev-parse', '--show-toplevel'], {
        encoding: 'utf8',
        stdio: ['ignore', 'pipe', 'ignore'],
      }).trim(),
    );
  } catch {
    return null;
  }
}

export function commandExists(name) {
  try {
    execFileSync(name, ['--version'], { stdio: 'ignore' });
    return true;
  } catch {
    return false;
  }
}

export function conventional(subject) {
  const m = PREFIX.exec(subject);
  return m
    ? {
        type: m[1],
        scope: m[2] ? m[2].slice(1, -1) : '',
        prefix: m[0],
        rest: subject.slice(m[0].length),
      }
    : null;
}

export function wrap(text, width = SUBJECT_MAX) {
  const lines = [];
  let line = '';
  for (const word of text.split(/\s+/).filter(Boolean)) {
    if (line && line.length + 1 + word.length > width) {
      lines.push(line);
      line = word;
    } else line = line ? `${line} ${word}` : word;
  }
  if (line) lines.push(line);
  return lines.join('\n');
}

const STRONG_BOUNDARY = /; | — |: | \(/g;
const WEAK_BOUNDARY = /, /g;
const DANGLING =
  /\s+(?:a|an|the|and|or|of|to|in|on|at|by|for|so|with|that|its|their|from|per|as|is|are|but|into|than|previous)$/i;

function lastBoundary(rest, pattern, min, room) {
  let cut = -1;
  for (const m of rest.matchAll(pattern)) {
    const head = rest.slice(0, m.index);
    const balanced = (head.match(/\(/g)?.length ?? 0) === (head.match(/\)/g)?.length ?? 0);
    if (m.index >= min && m.index <= room && balanced) cut = m.index;
  }
  return cut;
}

export function shortenSubject(subject, max = SUBJECT_MAX) {
  if (subject.length <= max) return subject;
  const prefix = conventional(subject)?.prefix ?? '';
  const rest = subject.slice(prefix.length);
  const room = max - prefix.length;
  let cut = lastBoundary(rest, STRONG_BOUNDARY, 10, room);
  if (cut < 0) cut = lastBoundary(rest, WEAK_BOUNDARY, 16, room);
  let head = cut > 0 ? rest.slice(0, cut) : rest.slice(0, room + 1);
  if (cut < 0)
    head = head.includes(' ') ? head.slice(0, head.lastIndexOf(' ')) : head.slice(0, room);
  head = head.replace(/[\s,;:(—-]+$/, '').replace(/\.$/, '');
  while (DANGLING.test(head)) head = head.replace(DANGLING, '');
  return prefix + head;
}

/** Subject for a "Merge branch ..." commit, derived from the subject of the merged tip. */
export function mergeSubject(mergedTipSubject) {
  const stripped = conventional(mergedTipSubject)?.rest ?? mergedTipSubject;
  return shortenSubject(`chore: merge ${stripped}`);
}

const TRAILER = /^(?:Co-Authored-By|Claude-Session|Generated-by):.*$/gim;

/** Lines an AI tool added to a message: session links and AI co-author trailers. Human co-authors do not match. */
export const TOOL_TRAILER = String.raw`^(?:(?:Claude-Session|Generated-by):.*|Co-Authored-By:.*<[^>]*@(?:anthropic|openai|cursor)\.[a-z]+>.*)$`;

export const hasToolTrailers = (message) => new RegExp(TOOL_TRAILER, 'im').test(message);

export function stripTrailers(message) {
  return `${message
    .replace(TRAILER, '')
    .replace(/\n{3,}/g, '\n\n')
    .replace(/\s+$/, '')}\n`;
}

export function rewriteMessage(newSubject, originalMessage) {
  const [first = '', ...others] = originalMessage.replace(/\s+$/, '').split('\n');
  const body = others.join('\n').replace(/^\n+/, '');
  const parts = [newSubject];
  if (first !== newSubject) parts.push(wrap(first));
  if (body) parts.push(body);
  return `${parts.join('\n\n')}\n`;
}
