import type { LocalSession } from '@aether/contracts';
import type { Key } from '../../lib/i18n/i18n.js';
import { compact, type Locale } from '../kpi/kpi-model.js';

/**
 * Pure. What a context gauge says in words: the share in use and, when the window it is measured against is a guess
 * (Claude's transcript does not record it), that it is. A 200k window is assumed; past 200k only a 1M window is possible,
 * so the percentage falls there and the label says why.
 */
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
