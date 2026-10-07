/**
 * The 2D context of a canvas the scene just made. Every browser it runs in has one, so a missing one means a broken
 * environment (the scene's error boundary shows the fallback), not a case each painter handles.
 */
export function context2d(canvas: HTMLCanvasElement): CanvasRenderingContext2D {
  const g = canvas.getContext('2d');
  if (!g) throw new Error('Canvas 2D is not available');
  return g;
}
