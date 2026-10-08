import { describe, expect, it } from 'vitest';
import { mayAppendFieldPerfFrameDelta } from '../../apps/web/src/features/field-perf/frame-delta.js';

describe('mayAppendFieldPerfFrameDelta', () => {
  it('skips deltas while the document is hidden', () => {
    expect(mayAppendFieldPerfFrameDelta('hidden', 100, 116)).toEqual({ append: false });
  });

  it('records a delta when visible and lastFrameAt is set', () => {
    expect(mayAppendFieldPerfFrameDelta('visible', 100, 116)).toEqual({
      append: true,
      delta: 16,
    });
  });

  it('skips the first visible frame after lastFrameAt was cleared', () => {
    expect(mayAppendFieldPerfFrameDelta('visible', null, 116)).toEqual({ append: false });
  });
});
