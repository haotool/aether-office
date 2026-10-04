import { zh } from './locales/zh.js';
import { en } from './locales/en.js';

export { zh, en };
export type Key = keyof typeof zh;
export type Locale = 'zh-TW' | 'en';
export const translate = (locale: Locale, key: Key): string => (locale === 'zh-TW' ? zh : en)[key];
