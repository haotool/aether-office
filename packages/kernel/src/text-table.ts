/**
 * Pure. The inside of an HTML `<table>` as a Markdown table (the first row is the header). `clean` turns each cell's own
 * HTML into Markdown; a cell is one line, its pipes escaped. Without a row there is nothing to tabulate and the text of
 * the cells is returned as it is.
 */
const ROW = /<tr\b[^>]*>([\s\S]*?)(?:<\/tr\s*>|(?=<tr\b)|$)/gi;
const CELL = /<t[hd]\b[^>]*>([\s\S]*?)(?:<\/t[hd]\s*>|(?=<t[hd]\b)|$)/gi;

export function htmlTable(inner: string, clean: (html: string) => string): string {
  const rows = [...inner.matchAll(ROW)]
    .map((row) =>
      [...row[1]!.matchAll(CELL)].map((cell) =>
        clean(cell[1]!)
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
