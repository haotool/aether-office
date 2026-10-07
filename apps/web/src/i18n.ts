import { zh } from './locales/zh.js';
import { en } from './locales/en.js';

export { zh, en };
export type Key = keyof typeof zh;
export type Locale = 'zh-TW' | 'en';
export const translate = (locale: Locale, key: Key): string => (locale === 'zh-TW' ? zh : en)[key];

/** The first-run language: Chinese browsers get Traditional Chinese, everything else English. A saved choice never reaches this. */
export const resolveLocale = (language: string | undefined): Locale =>
  /^zh/i.test(language ?? '') ? 'zh-TW' : 'en';

/** Fills `{0}`, `{1}` ... in a translated sentence. */
export const fill = (text: string, ...values: (string | number)[]) =>
  text.replace(/\{(\d)\}/g, (_, i: string) => String(values[Number(i)] ?? ''));
