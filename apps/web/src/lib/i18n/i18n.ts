import type { zh } from '../../locales/zh.js';

export type Key = keyof typeof zh;
export type Locale = 'zh-TW' | 'en';
export type Table = Record<Key, string>;

// Only the language in use is downloaded: `loadLocale` fetches a table once and keeps it here (see main.tsx and
// PreferenceControls for the two places that wait for it). Tests register both through tests/aether/setup-locales.ts.
const tables: Partial<Record<Locale, Table>> = {};
const loaders: Record<Locale, () => Promise<Table>> = {
  'zh-TW': () => import('../../locales/zh.js').then((m) => m.zh),
  en: () => import('../../locales/en.js').then((m) => m.en),
};
export const registerLocale = (locale: Locale, table: Table) => void (tables[locale] = table);
export const hasLocale = (locale: Locale) => locale in tables;
export const loadLocale = async (locale: Locale): Promise<void> => {
  tables[locale] ??= await loaders[locale]();
};
/** The text of `key`; a language that is not loaded (it is always loaded before the page shows) falls back to the other. */
export const translate = (locale: Locale, key: Key): string =>
  (tables[locale] ?? tables.en ?? tables['zh-TW'])?.[key] ?? key;

/** The first-run language: Chinese browsers get Traditional Chinese, everything else English. A saved choice never reaches this. */
export const resolveLocale = (language: string | undefined): Locale =>
  /^zh/i.test(language ?? '') ? 'zh-TW' : 'en';

/** Fills `{0}`, `{1}` ... in a translated sentence. */
export const fill = (text: string, ...values: (string | number)[]) =>
  text.replace(/\{(\d)\}/g, (_, i: string) => String(values[Number(i)] ?? ''));
