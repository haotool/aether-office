import { describe, expect, it } from 'vitest';
import { MENU_KEYS, nextMenuIndex } from '../../apps/web/src/features/shell-chrome/menu-nav.js';

describe('nextMenuIndex', () => {
  it('moves forward and back, wrapping at both ends', () => {
    expect(nextMenuIndex('ArrowDown', 0, 3)).toBe(1);
    expect(nextMenuIndex('ArrowRight', 2, 3)).toBe(0);
    expect(nextMenuIndex('ArrowUp', 0, 3)).toBe(2);
    expect(nextMenuIndex('ArrowLeft', 2, 3)).toBe(1);
  });
  it('jumps to the ends, and starts from the first or the second to last when nothing has focus', () => {
    expect(nextMenuIndex('Home', 2, 5)).toBe(0);
    expect(nextMenuIndex('End', 0, 5)).toBe(4);
    expect(nextMenuIndex('ArrowDown', -1, 4)).toBe(0);
    expect(nextMenuIndex('ArrowUp', -1, 4)).toBe(2);
  });
  it('names the keys it answers', () => {
    expect(MENU_KEYS).toContain('Home');
    expect(MENU_KEYS).not.toContain('Enter');
  });
});
