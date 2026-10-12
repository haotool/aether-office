const ROW = /<tr\b[^>]*>([\s\S]*?)(?:<\/tr\s*>|(?=<tr\b)|$)/gi;
const CELL = /<t[hd]\b[^>]*>([\s\S]*?)(?:<\/t[hd]\s*>|(?=<t[hd]\b)|$)/gi;

export function htmlTable(inner: string, clean: (html: string) => string): string {
  const rows = [...inner.matchAll(ROW)]
    .map((row) =>
      [...(row[1] ?? '').matchAll(CELL)].map((cell) =>
        clean(cell[1] ?? '')
          .replace(/\s*\n+\s*/g, ' ')
          .replace(/\|/g, '\\|')
          .trim(),
      ),
    )
    .filter((cells) => cells.length > 0);
  if (rows.length === 0) return `\n\n${clean(inner.replace(/<\/?[a-zA-Z][^<>]*>/g, ' '))}\n\n`;
  const width = Math.max(...rows.map((r) => r.length));
  const line = (cells: string[]) =>
    `| ${Array.from({ length: width }, (_, i) => cells[i] ?? '').join(' | ')} |`;
  const [head, ...body] = rows as [string[], ...string[][]];
  return `\n\n${[line(head), line(Array(width).fill('---')), ...body.map(line)].join('\n')}\n\n`;
}
