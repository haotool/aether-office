/** The keys a menu answers by moving focus. */
export const MENU_KEYS = ['ArrowDown', 'ArrowRight', 'ArrowUp', 'ArrowLeft', 'Home', 'End'];

/** Pure. Which of `count` menu items gets focus when `key` is pressed while item `at` (-1: none) has it; it wraps around. */
export function nextMenuIndex(key: string, at: number, count: number): number {
  if (key === 'Home') return 0;
  if (key === 'End') return count - 1;
  const step = key === 'ArrowDown' || key === 'ArrowRight' ? 1 : -1;
  return (at + step + count) % count;
}
