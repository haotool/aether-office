import type { Key } from '../lib/i18n/i18n.js';
import { useT } from './useT.js';

export function Badge({ state }: { state: string }) {
  const t = useT();
  const key = state as Key;
  return (
    <span className={`badge state-${state}`}>
      <span />
      {t(key) ?? state}
    </span>
  );
}
