const free: HTMLCanvasElement[] = [];

export function borrowCanvas(width: number, height: number): HTMLCanvasElement {
  const canvas = free.pop() ?? document.createElement('canvas');
  canvas.width = width;
  canvas.height = height;
  return canvas;
}

export function returnCanvas(canvas: HTMLCanvasElement): void {
  if (free.length < 4) free.push(canvas);
}
