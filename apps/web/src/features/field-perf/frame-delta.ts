/** rAF deltas are only recorded while the document is visible (hidden tabs skew FPS). */
export function mayAppendFieldPerfFrameDelta(
  visibilityState: DocumentVisibilityState,
  lastFrameAt: number | null,
  now: number,
): { append: true; delta: number } | { append: false } {
  if (visibilityState !== 'visible' || lastFrameAt === null) return { append: false };
  const delta = now - lastFrameAt;
  if (delta <= 0 || delta >= 10_000) return { append: false };
  return { append: true, delta };
}
