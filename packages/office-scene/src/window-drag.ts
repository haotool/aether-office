/**
 * Listens on the window while a pointer drag is under way: the pointer's moves, its release or cancel, and Esc.
 * `finish('drop')` is called on a release, `finish('cancel')` on a cancel or Esc. Returns what removes the listeners.
 */
export function listenWhileDragging(
  move: (e: PointerEvent) => void,
  finish: (outcome: 'drop' | 'cancel') => void,
): () => void {
  const drop = () => finish('drop');
  const cancel = () => finish('cancel');
  const key = (e: KeyboardEvent) => e.key === 'Escape' && finish('cancel');
  window.addEventListener('pointermove', move);
  window.addEventListener('pointerup', drop);
  window.addEventListener('pointercancel', cancel);
  window.addEventListener('keydown', key);
  return () => {
    window.removeEventListener('pointermove', move);
    window.removeEventListener('pointerup', drop);
    window.removeEventListener('pointercancel', cancel);
    window.removeEventListener('keydown', key);
  };
}
