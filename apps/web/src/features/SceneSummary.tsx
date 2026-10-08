import { useEffect, useId, useRef } from 'react';
import { useT } from '../ui/useT.js';

/**
 * Gives the 3D canvas an accessible name and a text equivalent: the canvas is an image of the office (`role="img"`) described
 * by one sentence that a screen reader announces politely when it changes. The sentence only changes when a count does, so
 * it is not read on every frame. The canvas belongs to the scene package, so it is found in the page instead of changed there.
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
    const watch = new MutationObserver(label); // the canvas is mounted after the scene's code has loaded
    watch.observe(root, { childList: true, subtree: true });
    return () => watch.disconnect();
  }, [name, id]);
  return (
    <p ref={note} id={id} className="visually-hidden" aria-live="polite">
      {text}
    </p>
  );
}
