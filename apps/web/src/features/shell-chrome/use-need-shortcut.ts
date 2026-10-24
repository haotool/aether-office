import { useEffect } from 'react';
import { useLatest } from '../../hooks/use-latest.js';

const TYPING = new Set(['INPUT', 'TEXTAREA', 'SELECT']);

const isTyping = (target: EventTarget | null) =>
  target instanceof HTMLElement && (target.isContentEditable || TYPING.has(target.tagName));

export function useNeedShortcut(key: string | undefined, open: (key: string) => void) {
  const latest = useLatest({ key, open });
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key.toLowerCase() !== 'n' || e.ctrlKey || e.metaKey || e.altKey || isTyping(e.target))
        return;
      const { key: asking, open: go } = latest.current;
      if (!asking) return;
      e.preventDefault();
      go(asking);
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [latest]);
}
