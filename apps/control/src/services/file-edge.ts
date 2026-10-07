import { open } from 'node:fs/promises';

// The scanner reads the start or the end of dozens of transcripts every few seconds. A fresh zero-filled buffer for
// each read kept hundreds of MB resident; these few are borrowed, filled, decoded and handed back.
const MAX_SPARE = 8;
const spare: Buffer[] = [];

function borrow(size: number): Buffer {
  const i = spare.findIndex((b) => b.length >= size);
  return (i >= 0 ? spare.splice(i, 1)[0] : undefined) ?? Buffer.allocUnsafe(size);
}

function giveBack(buffer: Buffer): void {
  if (spare.length < MAX_SPARE) spare.push(buffer);
}

/**
 * Runs `use` on up to `bytes` from the start or end of a file, without decoding them. The buffer is only valid until
 * `use` returns (it is lent out again), so `use` must finish synchronously and keep nothing of it.
 */
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

/** Up to `bytes` from the start or end of a file, as text. A cut multi-byte character becomes U+FFFD. */
export const readEdge = (file: string, where: 'head' | 'tail', bytes: number): Promise<string> =>
  withEdge(file, where, bytes, (data) => data.toString('utf8'));
