import type { LocalSession } from '@aether/contracts';
import type { Key } from '../../lib/i18n/i18n.js';
import { compact, type Locale } from '../kpi/kpi-model.js';

export function contextLabel(
  usage: Pick<LocalSession['usage'], 'contextPct' | 'contextWindow' | 'contextWindowBasis'>,
  t: (key: Key) => string,
  locale: Locale,
): string | null {
  if (usage.contextPct === null) return null;
  const base = `${t('convContext')} ${Math.round(usage.contextPct)}%`;
  const note =
    usage.contextWindowBasis === 'assumed'
      ? t('ctxAssumed')
      : usage.contextWindowBasis === 'inferred'
        ? t('ctxInferred')
        : null;
  return note && usage.contextWindow
    ? `${base} · ${note}: ${compact(usage.contextWindow, locale)}`
    : base;
}
