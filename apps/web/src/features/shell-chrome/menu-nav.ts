export const MENU_KEYS = ['ArrowDown', 'ArrowRight', 'ArrowUp', 'ArrowLeft', 'Home', 'End'];

export function nextMenuIndex(key: string, at: number, count: number): number {
  if (key === 'Home') return 0;
  if (key === 'End') return count - 1;
  const step = key === 'ArrowDown' || key === 'ArrowRight' ? 1 : -1;
  return (at + step + count) % count;
}
