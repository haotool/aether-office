import { useEffect, useId, useRef } from 'react';
import { useT } from '../../ui/useT.js';

/**
 * The sentence only changes when a count does, so a screen reader does not announce it on every frame. The canvas
 * belongs to the scene package, so it is found in the page instead of changed there.
 */
export function SceneSummary({ text }: { text: string }) {
  const t = useT();
  const id = useId();
  const note = useRef<HTMLParagraphElement>(null);
  const name = t('sceneName');
  useEffect(() => {
    const root = note.current?.closest('main');
    if (!root) return;
    const label = () => {
      for (const canvas of root.querySelectorAll('canvas')) {
        canvas.setAttribute('role', 'img');
        canvas.setAttribute('aria-label', name);
        canvas.setAttribute('aria-describedby', id);
      }
    };
    label();
    const watch = new MutationObserver(label);
    watch.observe(root, { childList: true, subtree: true });
    return () => watch.disconnect();
  }, [name, id]);
  return (
    <p ref={note} id={id} className="visually-hidden" aria-live="polite">
      {text}
    </p>
  );
}
