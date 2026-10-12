export { parseMarkdown, type MdBlock, type Span } from '@aether/kernel';

type DiffKind = 'add' | 'del' | 'hunk' | 'ctx';
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
export const isDiff = (lang: string | undefined): boolean => lang === 'diff' || lang === 'patch';
