// The stamp is a receipt, never a verdict: RECEIVED, or RETURNED (neutral grey) when the parent's own tool result is
// flagged as an error; it never says approved, passed or failed, and its colours are never red or green.

export type StampKind = 'received' | 'returned';

export type HandedResult = { error?: boolean | null; ok?: boolean | null } | null | undefined;

export const stampOf = (result: HandedResult): StampKind =>
  result?.error === true || result?.ok === false ? 'returned' : 'received';

export const STAMP_WORDS = {
  en: { received: 'RECEIVED', returned: 'RETURNED' },
  zh: { received: '已收到', returned: '已退回' },
} as const satisfies Record<'en' | 'zh', Record<StampKind, string>>;

export const stampWord = (zh: boolean, kind: StampKind): string =>
  (zh ? STAMP_WORDS.zh : STAMP_WORDS.en)[kind];

export const STAMP_INK = { received: '#5d7fae', returned: '#8b919b' } as const satisfies Record<
  StampKind,
  string
>;
