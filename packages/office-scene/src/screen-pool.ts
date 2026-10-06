/** Scratch canvases shared by every desk screen: a transition borrows one for a third of a second and gives it back. */
const free: HTMLCanvasElement[] = [];

export function borrowCanvas(width: number, height: number): HTMLCanvasElement {
  const canvas = free.pop() ?? document.createElement('canvas');
  canvas.width = width; // also clears it
  canvas.height = height;
  return canvas;
}

export function returnCanvas(canvas: HTMLCanvasElement): void {
  if (free.length < 4) free.push(canvas);
}
