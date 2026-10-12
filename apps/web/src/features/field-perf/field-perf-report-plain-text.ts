import type { RefObject } from 'react';
import { copyText } from '../../lib/platform/browser-compat.js';
import type { FieldPerfCollector } from './collector.js';

type FieldPerfPlainTextOutcome = 'idle' | 'ok' | 'manual';

export async function serializeFieldPerfReportPlainText(
  collector: RefObject<FieldPerfCollector | null>,
  messages: {
    success: string;
    failed: string;
  },
): Promise<{ state: FieldPerfPlainTextOutcome; json: string | null; announce: string }> {
  const c = collector.current;
  if (!c) return { state: 'idle', json: null, announce: '' };
  const json = JSON.stringify(await c.snapshot(), null, 2);
  const ok = await copyText(json);
  if (ok) return { state: 'ok', json: null, announce: messages.success };
  return { state: 'manual', json, announce: messages.failed };
}
