import type { Notice } from '@aether/kernel';

/** Pure. What a notice looks like and how a run of them is laid out; the words come from the locale in the component. */
export type Tone = 'ok' | 'failed' | 'neutral';
type Context = Extract<Notice, { kind: 'context' }>;
export type NoticeGroup =
  { kind: 'contexts'; items: Context[] } | Exclude<Notice, { kind: 'context' }>;

const DONE = new Set(['completed', 'complete', 'success', 'succeeded', 'done']);
const BAD = new Set(['failed', 'error', 'errored', 'killed', 'cancelled', 'canceled', 'stopped']);

/** Success or failure only from what the CLI reported: a status word and an exit code. Anything else stays neutral. */
export function noticeTone(n: Notice): Tone {
  if (n.kind === 'output') return n.error ? 'failed' : 'neutral';
  if (n.kind !== 'task') return 'neutral';
  if (n.exitCode !== null && n.exitCode !== 0) return 'failed';
  if (n.status && BAD.has(n.status)) return 'failed';
  return n.status && DONE.has(n.status) && (n.exitCode === null || n.exitCode === 0)
    ? 'ok'
    : 'neutral';
}

/** The context notices of a run as one entry (placed where the first was), every other notice as it is. */
export function groupNotices(notices: readonly Notice[]): NoticeGroup[] {
  const contexts: Context[] = notices.filter((n): n is Context => n.kind === 'context');
  const out: NoticeGroup[] = [];
  let placed = false;
  for (const n of notices) {
    if (n.kind !== 'context') out.push(n);
    else if (!placed) {
      placed = true;
      out.push({ kind: 'contexts', items: contexts });
    }
  }
  return out;
}
