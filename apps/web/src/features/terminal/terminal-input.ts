import type { TerminalAccess } from './terminal-model.js';

const BATCH_MS = 50;
const BATCH_LIMIT = 8192;

type Batcher = { push: (text: string) => void; dispose: () => void };

/**
 * Batches typed text (50 ms, 8 KiB) and sends it in order while `access` allows it. A rejected send disarms the
 * terminal (`access` is switched off) and reports the error.
 */
export function inputBatcher(
  send: (epoch: number, text: string) => Promise<unknown>,
  access: { current: TerminalAccess },
  on: { onDisarm: (message: string) => void; onError: (message: string) => void },
): Batcher {
  let buffer = '',
    timer: ReturnType<typeof setTimeout> | undefined,
    chain = Promise.resolve(),
    disposed = false;
  const flush = () => {
    timer = undefined;
    const text = buffer;
    buffer = '';
    if (!text || !access.current.enabled || disposed) return;
    const epoch = access.current.epoch;
    chain = chain
      .then(async () => {
        if (disposed || !access.current.enabled || access.current.epoch !== epoch) return;
        await send(epoch, text);
      })
      .catch((e) => {
        access.current.enabled = false;
        on.onDisarm(e instanceof Error ? e.message : 'TERMINAL_INPUT_UNKNOWN');
      });
  };
  return {
    push(text) {
      if (!access.current.enabled) return;
      if (buffer.length + text.length > BATCH_LIMIT) {
        on.onError('PTY_INPUT_LIMIT');
        return;
      }
      buffer += text;
      timer ??= setTimeout(flush, BATCH_MS);
    },
    dispose() {
      disposed = true;
      if (timer) clearTimeout(timer);
    },
  };
}
