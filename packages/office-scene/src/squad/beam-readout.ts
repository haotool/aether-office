// The words for the beam's rate, in both locales: a short readout and a tooltip that says where the number comes from.
import type { BeamRate } from './beam-rate.js';

const compact = (n: number, zh: boolean) =>
  new Intl.NumberFormat(zh ? 'zh-TW' : 'en', {
    notation: 'compact',
    maximumFractionDigits: n >= 1000 ? 1 : 0,
  }).format(n);

/**
 * "~12K tokens/min" or "~8 tool calls/min" (null when nothing is happening). Numbers are `Intl` compact, so the zh-TW
 * reading is "1.2萬". The unit is part of the text: a tool-call rate is never shown as tokens.
 */
export function beamReadout(zh: boolean, rate: BeamRate): string | null {
  const n = Math.round(rate.perMinute);
  if (n < 1) return null;
  const amount = compact(n, zh);
  if (rate.source === 'tokens') return zh ? `約 ${amount} tokens/分鐘` : `~${amount} tokens/min`;
  return zh ? `約 ${amount} 次工具呼叫/分鐘` : `~${amount} tool calls/min`;
}

/** The tooltip: the readout and where it comes from ("based on tokens" or "based on tool calls"). */
export function beamBasis(zh: boolean, rate: BeamRate): string | null {
  const readout = beamReadout(zh, rate);
  if (!readout) return null;
  if (rate.source === 'tokens')
    return zh ? `${readout}（依 token 用量）` : `${readout} (based on tokens)`;
  return zh ? `${readout}（依工具呼叫次數）` : `${readout} (based on tool calls)`;
}
