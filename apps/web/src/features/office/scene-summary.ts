import type { Agent } from '@aether/contracts';
import { fill, translate, type Locale } from '../../lib/i18n/i18n.js';

export function sceneSummary(
  agents: readonly Agent[],
  floorOf: (agent: Agent) => number,
  locale: Locale,
): string {
  if (!agents.length) return translate(locale, 'sceneSummaryEmpty');
  const floors = new Set(agents.map(floorOf)).size;
  const working = agents.filter((a) => a.activity === 'working').length;
  const waiting = agents.filter((a) => a.activity === 'waiting_permission').length;
  return fill(translate(locale, 'sceneSummary'), agents.length, floors, working, waiting);
}
