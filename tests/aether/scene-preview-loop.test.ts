import { describe, expect, it } from 'vitest';
import { previewParams } from '../../apps/web/src/features/scene-preview.js';

describe('previewParams loop', () => {
  it('is off unless asked, so a frozen frame stays frozen', () => {
    expect(previewParams('?preview=life&effect=rubber-duck&t=500')).toEqual({
      effect: 'rubber-duck',
      t: 500,
    });
  });

  it('plays the effects on from `t`, over and over, when `loop=1`', () => {
    expect(previewParams('?preview=life&effect=rubber-duck&t=500&loop=1')).toEqual({
      effect: 'rubber-duck',
      t: 500,
      loop: true,
    });
    expect(previewParams('?preview=life&effect=rubber-duck&loop=0')).toEqual({
      effect: 'rubber-duck',
      t: 0,
    });
  });
});
