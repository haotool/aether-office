// Human-readable release score table (must match JSON fields).
const fmt = (n) => (n === null || n === undefined ? '-' : String(n));

export function renderReleaseTable(report) {
  const head = ['id', 'layer', 'type', 'status', 'value', 'credit', 'source'];
  const rows = report.criteria.map((c) => [
    c.id,
    c.layer,
    c.type,
    c.status,
    fmt(c.value),
    fmt(c.credit),
    c.source,
  ]);
  const widths = head.map((h, i) => Math.max(h.length, ...rows.map((r) => r[i].length)));
  const line = (cells) => cells.map((c, i) => c.padEnd(widths[i])).join('  ');
  const out = [line(head), line(widths.map((w) => '-'.repeat(w))), ...rows.map(line)];
  out.push('');
  for (const layer of Object.keys(report.layers).sort())
    out.push(`${layer}  ${report.layers[layer]}`);
  out.push(`overall  ${report.overall}`);
  out.push(`unmeasured  ${report.unmeasured}`);
  const failedG = Object.entries(report.gates).filter(([, ok]) => !ok);
  out.push(`gates failed  ${failedG.length}`);
  return out.join('\n');
}
