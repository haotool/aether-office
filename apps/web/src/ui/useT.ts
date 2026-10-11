import { usePreferences } from '../lib/preferences/state.js';
import { translate, type Key } from '../lib/i18n/i18n.js';
import { whyNot, type Need } from './whyNot.js';

export const useLocale = () => usePreferences((s) => s.locale);

export function useT() {
  const locale = useLocale();
  return (key: Key) => translate(locale, key);
}

export function useWhy() {
  const t = useT();
  return (...needs: Need[]) => whyNot(t, ...needs);
}
