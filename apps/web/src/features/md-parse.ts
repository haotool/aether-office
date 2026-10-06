/**
 * The Markdown an agent's reply uses is parsed in the kernel (`@aether/kernel`, shared with the scene's speech bubbles);
 * this file keeps what is specific to the conversation: telling a unified diff's lines apart.
 */
export { parseMarkdown, type MdBlock, type Span } from '@aether/kernel';

type DiffKind = 'add' | 'del' | 'hunk' | 'ctx';
/** One line of a unified diff: added, removed, a hunk header, or context. File headers (+++ / ---) are context. */
export function diffKind(line: string): DiffKind {
  if (line.startsWith('+++') || line.startsWith('---')) return 'ctx';
  return line.startsWith('+')
    ? 'add'
    : line.startsWith('-')
      ? 'del'
      : line.startsWith('@@')
        ? 'hunk'
        : 'ctx';
}
/** A fence is shown as a diff when its language says so. */
export const isDiff = (lang: string | undefined): boolean => lang === 'diff' || lang === 'patch';
