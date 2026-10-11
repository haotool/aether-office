import { open } from 'node:fs/promises';

const MAX_SPARE = 8;
const spare: Buffer[] = [];

function borrow(size: number): Buffer {
  const i = spare.findIndex((b) => b.length >= size);
  return (i >= 0 ? spare.splice(i, 1)[0] : undefined) ?? Buffer.allocUnsafe(size);
}

function giveBack(buffer: Buffer): void {
  if (spare.length < MAX_SPARE) spare.push(buffer);
}

/** The buffer is lent out again after `use` returns, so `use` must finish synchronously and keep nothing of it. */
export async function withEdge<T>(
  file: string,
  where: 'head' | 'tail',
  bytes: number,
  use: (data: Buffer) => T,
): Promise<T> {
  const handle = await open(file, 'r');
  try {
    const { size } = await handle.stat();
    const length = Math.min(size, bytes);
    const buffer = borrow(length);
    try {
      const { bytesRead } = await handle.read(
        buffer,
        0,
        length,
        where === 'head' ? 0 : size - length,
      );
      return use(buffer.subarray(0, bytesRead));
    } finally {
      giveBack(buffer);
    }
  } finally {
    await handle.close();
  }
}

export const readEdge = (file: string, where: 'head' | 'tail', bytes: number): Promise<string> =>
  withEdge(file, where, bytes, (data) => data.toString('utf8'));
