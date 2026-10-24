import { useCallback, useEffect, useRef } from 'react';
import { mountLog } from './aria-log.js';
import { sceneText } from '../i18n/scene-text.js';

export function useAriaLog(zh: boolean) {
  const host = useRef<HTMLDivElement>(null);
  const log = useRef<ReturnType<typeof mountLog> | null>(null);
  useEffect(() => {
    if (!host.current) return;
    log.current = mountLog(host.current, sceneText(zh, 'log.label'));
    return () => {
      log.current?.dispose();
      log.current = null;
    };
  }, [zh]);
  const say = useCallback((text: string) => log.current?.push(text), []);
  return { host, say };
}
