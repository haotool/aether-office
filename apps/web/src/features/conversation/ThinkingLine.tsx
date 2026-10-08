import { useEffect, useState } from 'react';
import { useT } from '../../ui/useT.js';
import { shortDuration } from './turn-groups.js';

/** "Working · 12s": a shimmering line at the end of the conversation while the session works, counting from `since`. */
export function ThinkingLine({ since }: { since: number | null }) {
  const t = useT();
  const [start] = useState(() => since ?? Date.now());
  const [now, setNow] = useState(() => Date.now());
  useEffect(() => {
    const timer = setInterval(() => setNow(Date.now()), 1000);
    return () => clearInterval(timer);
  }, []);
  return (
    <p className="thinking-line" role="status">
      <span className="shimmer">{t('convThinking')}</span>
      <time aria-hidden="true">{shortDuration(now - start)}</time>
    </p>
  );
}
