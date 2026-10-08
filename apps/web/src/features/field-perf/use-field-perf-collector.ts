import { useEffect, useRef, useState } from 'react';
import { usePhone } from '../../phone.js';
import { attachFieldPerfHooks, FieldPerfCollector } from './collector.js';

export function useFieldPerfCollector() {
  const phone = usePhone();
  const collector = useRef<FieldPerfCollector | null>(null);
  const [elapsedMs, setElapsedMs] = useState(0);

  useEffect(() => {
    collector.current?.setSceneMeta(phone);
  }, [phone]);

  useEffect(() => {
    const c = new FieldPerfCollector();
    collector.current = c;
    c.setSceneMeta(phone);
    attachFieldPerfHooks(c.hooks());
    c.start();
    const tick = window.setInterval(() => setElapsedMs(c.elapsedMs()), 500);
    return () => {
      window.clearInterval(tick);
      c.stop();
      delete (window as Window & { __aetherFieldPerfHook?: unknown }).__aetherFieldPerfHook;
    };
  }, []);

  return { collector, elapsedMs };
}
