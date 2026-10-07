import type { Agent } from '@aether/contracts';
import { fill, translate, type Locale } from '../i18n.js';

/** The office in a sentence for a person who cannot see the canvas: how many characters, on how many floors, how many busy or waiting. */
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
