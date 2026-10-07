import { useCallback, useEffect, useRef } from 'react';
import { mountLog } from './aria-log.js';

/**
 * The scene's one `role="log"` region, mounted into the element `host` is put on. Everything the office announces (the
 * life effects and the squad's joins and leaves) goes through `say`, so they share one queue: one polite line per 5 s.
 */
export function useAriaLog(zh: boolean) {
  const host = useRef<HTMLDivElement>(null);
  const log = useRef<ReturnType<typeof mountLog> | null>(null);
  useEffect(() => {
    if (!host.current) return;
    log.current = mountLog(
      host.current,
      zh ? '辦公室動態（裝飾）' : 'Office activity (decorative)',
    );
    return () => {
      log.current?.dispose();
      log.current = null;
    };
  }, [zh]);
  const say = useCallback((text: string) => log.current?.push(text), []);
  return { host, say };
}
