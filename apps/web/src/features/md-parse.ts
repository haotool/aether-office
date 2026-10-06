/**
 * Pure. The small part of Markdown an agent's reply uses: paragraphs, headings, bullet and numbered lists, fenced code,
 * `code`, **bold** and *italic*. Output is data for React to render as elements, so nothing a reply says is ever HTML.
 */
export type Inline = { type: 'text' | 'code' | 'bold' | 'italic'; text: string };
export type MdBlock =
  | { type: 'paragraph' | 'heading'; inline: Inline[] }
  | { type: 'list'; ordered: boolean; items: Inline[][] }
  | { type: 'code'; text: string; lang?: string };

export type DiffKind = 'add' | 'del' | 'hunk' | 'ctx';
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

export function parseInline(text: string): Inline[] {
  return text
    .split(/(`[^`\n]+`|\*\*[^*\n]+\*\*|\*[^*\s][^*\n]*\*)/)
    .filter(Boolean)
    .map((part): Inline => {
      if (part.length > 2 && part.startsWith('`') && part.endsWith('`'))
        return { type: 'code', text: part.slice(1, -1) };
      if (part.length > 4 && part.startsWith('**') && part.endsWith('**'))
        return { type: 'bold', text: part.slice(2, -2) };
      if (part.length > 2 && part.startsWith('*') && part.endsWith('*'))
        return { type: 'italic', text: part.slice(1, -1) };
      return { type: 'text', text: part };
    });
}

const BULLET = /^\s*[-*+]\s+(.*)$/;
const NUMBERED = /^\s*\d+[.)]\s+(.*)$/;
const HEADING = /^\s{0,3}#{1,6}\s+(.*)$/;

export function parseMarkdown(source: string): MdBlock[] {
  const blocks: MdBlock[] = [];
  let paragraph: string[] = [];
  const flush = () => {
    if (paragraph.length)
      blocks.push({ type: 'paragraph', inline: parseInline(paragraph.join(' ')) });
    paragraph = [];
  };
  const lines = source.replace(/\r/g, '').split('\n');
  for (let i = 0; i < lines.length; i++) {
    const line = lines[i]!;
    if (/^\s*```/.test(line)) {
      flush();
      const lang = /^\s*```\s*([\w+#.-]+)/.exec(line)?.[1];
      const code: string[] = [];
      for (i++; i < lines.length && !/^\s*```/.test(lines[i]!); i++) code.push(lines[i]!);
      blocks.push({ type: 'code', text: code.join('\n'), ...(lang ? { lang } : {}) });
      continue;
    }
    const list = BULLET.exec(line) ?? NUMBERED.exec(line);
    if (list) {
      flush();
      const ordered = !BULLET.test(line);
      const last = blocks.at(-1);
      const item = parseInline(list[1]!);
      if (last?.type === 'list' && last.ordered === ordered) last.items.push(item);
      else blocks.push({ type: 'list', ordered, items: [item] });
      continue;
    }
    const heading = HEADING.exec(line);
    if (heading) {
      flush();
      blocks.push({ type: 'heading', inline: parseInline(heading[1]!) });
    } else if (line.trim()) paragraph.push(line.trim());
    else flush();
  }
  flush();
  return blocks;
}
