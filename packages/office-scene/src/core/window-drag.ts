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
