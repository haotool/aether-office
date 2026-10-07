// The words of the hand-over, in both locales, for the scene's one aria log (relation row R4).
import type { StampKind } from './stamp.js';

/** "Explore handed over its result" (and what the stamp said, when the result was flagged as an error). */
export function handoverLine(zh: boolean, type: string, kind: StampKind): string {
  if (kind === 'returned')
    return zh
      ? `${type} 交回了結果（標記為錯誤）`
      : `${type} handed over its result, marked as an error`;
  return zh ? `${type} 交回了結果` : `${type} handed over its result`;
}
