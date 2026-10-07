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

  it('takes several effects joined by commas, up to six', () => {
    expect(previewParams('?preview=life&effect=rubber-duck,ci-lamp&t=100')).toEqual({
      effect: 'rubber-duck,ci-lamp',
      t: 100,
    });
    expect(previewParams('?preview=life&effect=a,b,c,d,e,f')).not.toBeNull();
    expect(previewParams('?preview=life&effect=a,b,c,d,e,f,g')).toBeNull();
    expect(previewParams('?preview=life&effect=a,,b')).toBeNull();
    expect(previewParams('?preview=life&effect=a,')).toBeNull();
  });

  it('takes a value after a colon, for the effects that read one', () => {
    expect(previewParams('?preview=life&effect=ci-stack:0,tech-debt:60&t=100')).toEqual({
      effect: 'ci-stack:0,tech-debt:60',
      t: 100,
    });
    expect(previewParams('?preview=life&effect=ci-stack:')).toBeNull();
    expect(previewParams('?preview=life&effect=ci-stack:x')).toBeNull();
    expect(previewParams('?preview=life&effect=ci-stack:1:2')).toBeNull();
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
