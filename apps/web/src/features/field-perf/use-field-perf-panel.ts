import { useState } from 'react';
import { useT } from '../../ui/useT.js';
import { serializeFieldPerfReportPlainText } from './field-perf-report-plain-text.js';
import { useFieldPerfCollector } from './use-field-perf-collector.js';

const MIN_COLLECT_MS = 5_000;

export function useFieldPerfPanel() {
  const t = useT();
  const { collector, elapsedMs } = useFieldPerfCollector();
  const [copyState, setCopyState] = useState<'idle' | 'ok' | 'manual'>('idle');
  const [copyAnnounce, setCopyAnnounce] = useState('');
  const [manualJson, setManualJson] = useState<string | null>(null);

  const ready = elapsedMs >= MIN_COLLECT_MS;
  const statusText = ready ? t('fieldPerfReady') : t('fieldPerfCollecting');
  const copyDisabledReason = t('fieldPerfCopyDisabledReason');

  const onCopy = async () => {
    const result = await serializeFieldPerfReportPlainText(collector, {
      success: t('fieldPerfCopySuccessAnnounce'),
      failed: t('fieldPerfCopyFailedAnnounce'),
    });
    if (result.announce) setCopyAnnounce(result.announce);
    if (result.state === 'idle') return;
    setCopyState(result.state);
    setManualJson(result.json);
    if (result.state === 'ok') window.setTimeout(() => setCopyState('idle'), 2500);
  };

  return {
    ready,
    statusText,
    elapsedMs,
    copyState,
    copyAnnounce,
    manualJson,
    copyDisabledReason,
    onCopy,
    t,
  };
}
