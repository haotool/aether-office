/** True when the maintainer field perf overlay is opt-in via `?fieldperf=1` (exact value). */
export function isFieldPerfRequested(search: string): boolean {
  const raw = search.startsWith('?') ? search.slice(1) : search;
  return new URLSearchParams(raw).get('fieldperf') === '1';
}
