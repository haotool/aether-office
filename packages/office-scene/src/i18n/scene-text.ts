import { EN, type SceneKey } from './en.js';
import { ZH } from './zh.js';

export type { SceneKey };
type Values = Readonly<Record<string, string | number>>;

const ZH_LOCALE = 'zh-TW';
const EN_LOCALE = 'en';

export const intlLocale = (zh: boolean) => (zh ? ZH_LOCALE : EN_LOCALE);

export function sceneText(zh: boolean, key: SceneKey, values: Values = {}): string {
  return (zh ? ZH : EN)[key].replace(/\{(\w+)\}/g, (_, name: string) => String(values[name] ?? ''));
}

export const sceneT = (zh: boolean) => (key: SceneKey, values?: Values) =>
  sceneText(zh, key, values);
