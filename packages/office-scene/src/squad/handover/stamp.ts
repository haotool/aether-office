// What the hand-over stamp says. A subagent coming back with a result only means that a result came back: the stamp is a
// receipt, never a verdict. It reads RECEIVED, or RETURNED (neutral grey) when the parent's own tool result for the call
// is flagged as an error; it never says approved, passed or failed, and its colours are never red or green.

export type StampKind = 'received' | 'returned';

/** What the page knows of a result: the real flags, each `null` or absent when not known. */
export type HandedResult = { error?: boolean | null; ok?: boolean | null } | null | undefined;

/** RETURNED only on a real flag that says the result is an error (or the call did not succeed); everything else is a receipt. */
export const stampOf = (result: HandedResult): StampKind =>
  result?.error === true || result?.ok === false ? 'returned' : 'received';

export const STAMP_WORDS = {
  en: { received: 'RECEIVED', returned: 'RETURNED' },
  zh: { received: '已收到', returned: '已退回' },
} as const satisfies Record<'en' | 'zh', Record<StampKind, string>>;

export const stampWord = (zh: boolean, kind: StampKind): string =>
  STAMP_WORDS[zh ? 'zh' : 'en'][kind];

/** The ink: a calm slate blue for a receipt, a plain grey for a return. Neither reads as a pass or a fail. */
export const STAMP_INK = { received: '#5d7fae', returned: '#8b919b' } as const satisfies Record<
  StampKind,
  string
>;
