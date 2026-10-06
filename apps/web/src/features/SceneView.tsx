import { lazy, Suspense, useState } from 'react';
import { Orbit } from 'lucide-react';
import type { Snapshot } from '@aether/contracts';
import { STAGGER_MS, type PerfReport, type SceneSpeech } from '@aether/office-scene/model';
import { LOCAL_PREFIX, mergeLayout } from '../localSessions.js';
import { usePreferences } from '../state.js';
import type { Layout } from '@aether/contracts';
import type { TourAction } from '../tour.js';
import { useT } from '../ui.js';
import { Agents } from './Agents.js';
import { useGitGraph } from './GitGraph.js';
import type { OfficeModel } from './office-model.js';
import { useSpeechBySession } from './use-session-feed.js';

const OfficeScene = lazy(() =>
  import('@aether/office-scene').then((m) => ({ default: m.OfficeScene })),
);

// Opt-in measurement: `?perf=1` renders a fixed sample of frames and exposes the measured result.
const perfRequested = new URLSearchParams(window.location.search).has('perf');
function publishPerf(report: PerfReport) {
  const w = window as unknown as { __aetherPerf?: PerfReport; __aetherPerfHistory?: PerfReport[] };
  w.__aetherPerf = report;
  (w.__aetherPerfHistory ??= []).push(report); // one report per scene mount
}

// Opt-in preview: `?intensity=3` shows every member working at that level, with a stand-in screen, to look at the effects
// (faster typing, streaming screens, smoke) without a hundred busy sessions. Never used otherwise.
const rushRequested = Number(new URLSearchParams(window.location.search).get('intensity') ?? '');

// Opt-in preview: `?speech=1` gives every member a stand-in prompt and reply, to look at the bubbles without real sessions.
const speechPreview = new URLSearchParams(window.location.search).has('speech');
const STAND_IN_SPEECH: SceneSpeech = {
  user: { text: 'Preview prompt: add a retry to the upload and cover it with a test.', at: null },
  assistant: {
    text: 'Preview reply: the upload retries three times with a backoff; test added.',
    at: null,
  },
};

// Opt-in preview: `?clockout=N` sends every member home N seconds (default 2) after the scene opens, one after another, to look at the
// walk out without real sessions to stop. Nothing is stopped; it only moves the drawn members.
const clockOutPreview = new URLSearchParams(window.location.search).get('clockout');

/** The last prompt and reply of every running session, by office member id. Polled only while there is someone to show. */
function useSpeech(model: OfficeModel, enabled: boolean): Record<string, SceneSpeech> {
  const speech = useSpeechBySession(enabled && model.observed.length > 0);
  if (speechPreview) return Object.fromEntries(model.agents.map((a) => [a.id, STAND_IN_SPEECH]));
  return Object.fromEntries(
    Object.entries(speech).map(([key, value]) => [`${LOCAL_PREFIX}${key}`, value]),
  );
}

/** The office itself: the 3D scene (loaded when first shown) or, by choice or when WebGL fails, the 2D list. */
export function SceneView({
  data,
  model,
  selectedId,
  focus,
  preview,
  unread,
  canWrite,
  compact = false,
  onSelect,
  onTour,
  onNotice,
  onRefresh,
}: {
  data: Snapshot;
  model: OfficeModel;
  selectedId: string | null;
  focus: string;
  preview: Layout | null;
  unread: ReadonlySet<string>;
  canWrite: boolean;
  /** A phone: lighter rendering and a minimal HUD. */
  compact?: boolean;
  onSelect: (id: string) => void;
  onTour: (action: TourAction) => void;
  onNotice: (message: string) => void;
  onRefresh: () => void;
}) {
  const t = useT();
  const prefs = usePreferences();
  const speech = useSpeech(model, prefs.view === '3d');
  const leaving =
    useClockOutPreview(model, clockOutPreview !== null ? Number(clockOutPreview) || 2 : null) ??
    model.leaving;
  // No repository (or no access to it) means no beanstalk: the query just fails quietly.
  const graph = useGitGraph(data.project.id, prefs.beanstalk && prefs.view === '3d');
  const rush =
    rushRequested >= 1 && rushRequested <= 3
      ? {
          intensity: Object.fromEntries(
            model.agents.map((a) => [a.id, rushRequested as 1 | 2 | 3]),
          ),
          screens: Object.fromEntries(
            model.agents.map((a) => [
              a.id,
              {
                provider: 'claude' as const,
                title: `${a.name} · ${a.role}`,
                repo: 'preview',
                branch: 'main',
                ahead: 0,
                behind: 0,
                uncommitted: 3,
                model: null,
                contextPercent: 40,
                state: 'working' as const,
                tool: 'Edit',
                toolSince: Date.now(),
                recent: [
                  { tool: 'Grep', target: null },
                  { tool: 'Read', target: 'index.ts' },
                  { tool: 'Edit', target: 'index.ts' },
                  { tool: 'Bash', target: 'pnpm test' },
                  { tool: 'Bash', target: 'git commit' },
                  { tool: 'Edit', target: 'index.ts' },
                ],
                quietMinutes: 0,
                ports: [],
              },
            ]),
          ),
        }
      : null;
  // Recomputed per render on purpose: MessageCarriers dedupes by messageId, so identity does not matter.
  const sceneMessages = data.messages.map((m) => ({
    id: m.id,
    senderId: m.senderId,
    recipientIds: m.deliveries.map((d) => d.recipientId),
  }));
  if (prefs.view !== '3d')
    return (
      <div className="office-2d">
        <Agents
          snapshot={{ ...data, agents: model.agents }}
          onSelect={onSelect}
          onSaved={onRefresh}
          canWrite={canWrite}
        />
      </div>
    );
  return (
    <Suspense
      fallback={
        <div className="scene-loading">
          <Orbit size={32} />
          {t('loading')}
        </div>
      }
    >
      <OfficeScene
        compact={compact}
        pulses={model.pulses}
        doing={model.doing}
        speech={speech}
        screens={rush ? rush.screens : model.screens}
        intensity={rush ? rush.intensity : model.intensity}
        attention={model.attention}
        autoCamera={prefs.autoCamera}
        onToggleAuto={() => prefs.set({ autoCamera: !prefs.autoCamera })}
        agents={model.agents}
        roleOf={model.roleOf}
        apparitions={model.apparitions}
        zombies={model.zombies}
        leaving={leaving}
        branchOf={model.branchOf}
        beanstalk={prefs.beanstalk ? (graph.data?.commits ?? null) : null}
        unreadIds={new Set([...unread].map((key) => `local:${key}`))}
        layout={
          preview ??
          mergeLayout(data.layout?.data ?? null, data.agents, model.observed, model.floorOf)
        }
        selectedId={selectedId}
        onSelect={onSelect}
        quality={prefs.quality}
        reducedMotion={prefs.reducedMotion}
        locale={prefs.locale}
        focus={focus}
        messages={sceneMessages}
        {...(perfRequested ? { onPerfReport: publishPerf } : {})}
        onUserCamera={() => onTour({ type: 'interrupt' })}
        onMessageUnreachable={() => onNotice(t('messageUnreachable'))}
        onFailure={() => {
          prefs.set({ view: '2d' });
          onNotice(t('sceneFailed'));
        }}
      />
    </Suspense>
  );
}

/** The preview's stand-in departures (see `clockOutPreview`): every member, from `delay` seconds after the first look. */
function useClockOutPreview(
  model: OfficeModel,
  delay: number | null,
): Record<string, number> | null {
  const [start] = useState(() => Date.now() + (delay ?? 0) * 1000);
  if (delay === null) return null;
  return Object.fromEntries(model.agents.map((a, i) => [a.id, start + i * STAGGER_MS]));
}
