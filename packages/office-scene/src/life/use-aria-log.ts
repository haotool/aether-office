import { useCallback, useEffect, useRef } from 'react';
import { mountLog } from './aria-log.js';
import { sceneText } from '../i18n/scene-text.js';

/**
 * The scene's one `role="log"` region, mounted into the element `host` is put on. Everything the office announces (the
 * life effects and the squad's joins and leaves) goes through `say`, so they share one queue: one polite line per 5 s.
 */
export function useAriaLog(zh: boolean) {
  const host = useRef<HTMLDivElement>(null);
  const log = useRef<ReturnType<typeof mountLog> | null>(null);
  useEffect(() => {
    if (!host.current) return;
    log.current = mountLog(host.current, sceneText(zh, 'life.logLabel'));
    return () => {
      log.current?.dispose();
      log.current = null;
    };
  }, [zh]);
  const say = useCallback((text: string) => log.current?.push(text), []);
  return { host, say };
}
