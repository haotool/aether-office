import type { zh } from '../../locales/zh.js';

export type Key = keyof typeof zh;
export type Locale = 'zh-TW' | 'en';
export type Table = Record<Key, string>;

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
export const translate = (locale: Locale, key: Key): string =>
  (tables[locale] ?? tables.en ?? tables['zh-TW'])?.[key] ?? key;

export const resolveLocale = (language: string | undefined): Locale =>
  /^zh/i.test(language ?? '') ? 'zh-TW' : 'en';

export const fill = (text: string, ...values: (string | number)[]) =>
  text.replace(/\{(\d)\}/g, (_, i: string) => String(values[Number(i)] ?? ''));
