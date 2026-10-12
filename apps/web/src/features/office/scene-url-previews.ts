import { useState } from 'react';
import { STAGGER_MS, type PerfReport, type SceneSpeech } from '@aether/office-scene/model';
import type { Agent } from '@aether/contracts';
import { introForced } from '../../lib/navigation/intro-gate.js';
import { LOCAL_PREFIX } from '../../lib/sessions/session-names.js';
import type { OfficeModel } from './office-model.js';
import { standInFacts, standInRole } from './scene-preview.js';
import { useSpeechBySession } from '../sessions/use-session-feed.js';

const query = new URLSearchParams(window.location.search);

export const perfRequested = query.has('perf');
const perfParam = Number(query.get('perf'));
export const perfFrames = perfParam > 1 ? perfParam : 0;
export function publishPerf(report: PerfReport) {
  const w = window as Window & {
    __aetherPerf?: PerfReport;
    __aetherPerfHistory?: PerfReport[];
    __aetherFieldPerfHook?: { onProbe: (report: PerfReport) => void };
  };
  w.__aetherPerf = report;
  (w.__aetherPerfHistory ??= []).push(report);
  w.__aetherFieldPerfHook?.onProbe(report);
}

export const introForce = introForced(window.location.search);

const rushRequested = Number(query.get('intensity') ?? '');

export const compactPreview = query.has('compact');

export const talkPreview = query.has('talk');

const speechPreview = query.has('speech');
const STAND_IN_SPEECH: SceneSpeech = {
  user: { text: 'Preview prompt: add a retry to the upload and cover it with a test.', at: null },
  assistant: {
    text: '**Preview reply, done:**\n- the upload retries **three times** with a backoff in `upload.ts`\n- test added: `retries.test.ts`\n- 已移除 16 個分支，只動分支與暫存\n\n## Next\nrun the full suite and open the PR',
    at: null,
  },
};

const clockOutPreview = query.get('clockout');

export function useSpeech(model: OfficeModel, enabled: boolean): Record<string, SceneSpeech> {
  const speech = useSpeechBySession(enabled && model.observed.length > 0);
  if (speechPreview) return Object.fromEntries(model.agents.map((a) => [a.id, STAND_IN_SPEECH]));
  return Object.fromEntries(
    Object.entries(speech ?? {}).map(([key, value]) => [`${LOCAL_PREFIX}${key}`, value]),
  );
}

export function useClockOutPreview(model: OfficeModel): Record<string, number> | null {
  const delay = clockOutPreview !== null ? Number(clockOutPreview) || 2 : null;
  const [start] = useState(() => Date.now() + (delay ?? 0) * 1000);
  if (delay === null) return null;
  return Object.fromEntries(model.agents.map((a, i) => [a.id, start + i * STAGGER_MS]));
}

export function rushPreview(agents: readonly Agent[]) {
  if (!(rushRequested >= 1 && rushRequested <= 3)) return null;
  const level = rushRequested as 1 | 2 | 3;
  return {
    intensity: Object.fromEntries(agents.map((a) => [a.id, level])),
    screens: Object.fromEntries(
      agents.map((a, i) => [a.id, standInFacts(a, i % 2 ? 'codex' : 'claude', 40, i)]),
    ),
    roles: Object.fromEntries(agents.map((a, i) => [a.id, standInRole(i)])),
  };
}
