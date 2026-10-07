import { useEffect, useState } from 'react';
import { useLatest } from '../../use-latest.js';

/**
 * The last of the sections that reach the upper part of the scrolling page (its `s-<id>` element), so the navigation
 * can say where the person is. Null until one does.
 */
export function useScrollSpy<T extends string>(ids: readonly T[], enabled: boolean): T | null {
  const [active, setActive] = useState<T | null>(null);
  const key = ids.join();
  const idList = useLatest(ids);
  useEffect(() => {
    if (!enabled) return;
    const ids = idList.current;
    const seen = new Set<string>();
    const observer = new IntersectionObserver(
      (entries) => {
        for (const entry of entries)
          if (entry.isIntersecting) seen.add(entry.target.id);
          else seen.delete(entry.target.id);
        const last = ids.filter((id) => seen.has(`s-${id}`)).at(-1);
        if (last) setActive(last);
      },
      { root: document.querySelector('.main-content'), rootMargin: '0px 0px -65% 0px' },
    );
    for (const id of ids) {
      const element = document.getElementById(`s-${id}`);
      if (element) observer.observe(element);
    }
    return () => observer.disconnect();
  }, [key, enabled, idList]); // `key` is the content of `ids`
  return active;
}
