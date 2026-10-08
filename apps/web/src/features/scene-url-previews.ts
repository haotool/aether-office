import { useState } from 'react';
import { STAGGER_MS, type PerfReport, type SceneSpeech } from '@aether/office-scene/model';
import type { Agent } from '@aether/contracts';
import { introForced } from '../intro-gate.js';
import { LOCAL_PREFIX } from '../session-names.js';
import type { OfficeModel } from './office-model.js';
import { standInFacts, standInRole } from './scene-preview.js';
import { useSpeechBySession } from './use-session-feed.js';

// The address can switch on opt-in previews and measurements of the scene; none of them is used otherwise.
const query = new URLSearchParams(window.location.search);

// Opt-in measurement: `?perf=1` renders a fixed sample of frames and exposes the measured result.
export const perfRequested = query.has('perf');
// `?perf=600` samples 600 frames instead of the default 120 (`?perf=1` is only the flag).
const perfParam = Number(query.get('perf'));
export const perfFrames = perfParam > 1 ? perfParam : 0;
export function publishPerf(report: PerfReport) {
  const w = window as Window & {
    __aetherPerf?: PerfReport;
    __aetherPerfHistory?: PerfReport[];
    __aetherFieldPerfHook?: { onProbe: (report: PerfReport) => void };
  };
  w.__aetherPerf = report;
  (w.__aetherPerfHistory ??= []).push(report); // one report per scene mount
  w.__aetherFieldPerfHook?.onProbe(report);
}

// `?intro=force` plays the first-visit camera tour whatever the preference, the session or automation say (the tests' switch).
export const introForce = introForced(window.location.search);

// Opt-in preview: `?intensity=3` shows every member working at that level, with a stand-in screen, to look at the effects
// (faster typing, streaming screens, smoke) without a hundred busy sessions.
const rushRequested = Number(query.get('intensity') ?? '');

// Opt-in preview: `?compact=1` fills every member's context and compacts it every few seconds, with stand-in screens (see scene-preview.ts).
export const compactPreview = query.has('compact');

// Opt-in preview: `?talk=1` shows stand-in messages, tethers, threads and attention rings (see scene-preview.ts).
export const talkPreview = query.has('talk');

// Opt-in preview: `?speech=1` gives every member a stand-in prompt and reply, to look at the bubbles without real sessions.
const speechPreview = query.has('speech');
const STAND_IN_SPEECH: SceneSpeech = {
  user: { text: 'Preview prompt: add a retry to the upload and cover it with a test.', at: null },
  assistant: {
    text: '**Preview reply, done:**\n- the upload retries **three times** with a backoff in `upload.ts`\n- test added: `retries.test.ts`\n- 已移除 16 個分支，只動分支與暫存\n\n## Next\nrun the full suite and open the PR',
    at: null,
  },
};

// Opt-in preview: `?clockout=N` sends every member home N seconds (default 2) after the scene opens, one after another, to look at the
// walk out without real sessions to stop. Nothing is stopped; it only moves the drawn members.
const clockOutPreview = query.get('clockout');

/** The last prompt and reply of every running session, by office member id. Polled only while there is someone to show. */
export function useSpeech(model: OfficeModel, enabled: boolean): Record<string, SceneSpeech> {
  const speech = useSpeechBySession(enabled && model.observed.length > 0);
  if (speechPreview) return Object.fromEntries(model.agents.map((a) => [a.id, STAND_IN_SPEECH]));
  return Object.fromEntries(
    Object.entries(speech ?? {}).map(([key, value]) => [`${LOCAL_PREFIX}${key}`, value]),
  );
}

/** The preview's stand-in departures (see `clockOutPreview`): every member, from `delay` seconds after the first look. */
export function useClockOutPreview(model: OfficeModel): Record<string, number> | null {
  const delay = clockOutPreview !== null ? Number(clockOutPreview) || 2 : null;
  const [start] = useState(() => Date.now() + (delay ?? 0) * 1000);
  if (delay === null) return null;
  return Object.fromEntries(model.agents.map((a, i) => [a.id, start + i * STAGGER_MS]));
}

/** The `?intensity=` preview: every member working at that level with stand-in screens and roles, or null. */
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
