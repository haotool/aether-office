import type { Key } from '../../lib/i18n/i18n.js';

const KINDS: Record<string, Key> = {
  title: 'whyTitle',
  prompt: 'whyPrompt',
  branch: 'whyBranch',
  repo: 'whyRepo',
  edits: 'whyEdits',
  reads: 'whyReads',
  runs: 'whyRuns',
  tool: 'whyTool',
  subagent: 'whySubagent',
  mix: 'whyMix',
};
const NO_SIGNAL = 'no clear signal';

function explainEvidence(evidence: string, t: (key: Key) => string): string {
  if (evidence === NO_SIGNAL) return t('whyNone');
  const [kind = '', ...rest] = evidence.split(': ');
  const key = KINDS[kind];
  return key ? `${t(key)} ${rest.join(': ')}` : evidence;
}

export function roleWhy(
  c: { confidence: number; evidence: readonly string[] },
  t: (key: Key) => string,
): string {
  const percent = `${Math.round(c.confidence * 100)}%`;
  if (c.evidence.length === 1 && c.evidence[0] === NO_SIGNAL) return explainEvidence(NO_SIGNAL, t);
  const reasons = c.evidence.slice(0, 3).map((e) => explainEvidence(e, t));
  return `${percent} · ${t('roleBecause')}: ${reasons.join('; ')}`;
}
