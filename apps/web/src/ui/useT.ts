import { usePreferences } from '../state.js';
import { translate, type Key } from '../i18n.js';
import { whyNot, type Need } from './whyNot.js';

/** The language of the interface: the one preference most components read and nothing else of it. */
export const useLocale = () => usePreferences((s) => s.locale);

export function useT() {
  const locale = useLocale();
  return (key: Key) => translate(locale, key);
}

/** `whyNot` in the interface language: `{...whyNot([canWrite, 'needOperator'])}` on a control that may be off. */
export function useWhy() {
  const t = useT();
  return (...needs: Need[]) => whyNot(t, ...needs);
}
