import { describe, expect, it } from 'vitest';
import { previewParams } from '../../apps/web/src/features/scene-preview.js';

describe('previewParams', () => {
  it('reads the effect and the time from a full URL, a path or a bare query', () => {
    const want = { effect: 'rubber-duck', t: 1500 };
    expect(previewParams('http://127.0.0.1:4320/?preview=life&effect=rubber-duck&t=1500')).toEqual(
      want,
    );
    expect(previewParams('/office?preview=life&effect=rubber-duck&t=1500#x')).toEqual(want);
    expect(previewParams('?t=1500&effect=rubber-duck&preview=life')).toEqual(want);
    expect(previewParams('preview=life&effect=rubber-duck&t=1500')).toEqual(want);
  });

  it('defaults the time to 0', () => {
    expect(previewParams('?preview=life&effect=r8')).toEqual({ effect: 'r8', t: 0 });
  });

  it('is null for anything that is not a well-formed life preview', () => {
    expect(previewParams('')).toBeNull();
    expect(previewParams('/?perf=1')).toBeNull();
    expect(previewParams('?preview=other&effect=r8')).toBeNull();
    expect(previewParams('?preview=life')).toBeNull();
    expect(previewParams('?preview=life&effect=')).toBeNull();
    expect(previewParams('?preview=life&effect=Bad_Id')).toBeNull();
    expect(previewParams('?preview=life&effect=../x')).toBeNull();
    expect(previewParams('?preview=life&effect=r8&t=-1')).toBeNull();
    expect(previewParams('?preview=life&effect=r8&t=1.5')).toBeNull();
    expect(previewParams('?preview=life&effect=r8&t=abc')).toBeNull();
  });
});
