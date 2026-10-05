import { lazy, Suspense } from 'react';
import { Orbit } from 'lucide-react';
import type { Snapshot } from '@aether/contracts';
import type { PerfReport } from '@aether/office-scene/model';
import { mergeLayout } from '../localSessions.js';
import { usePreferences } from '../state.js';
import type { Layout } from '@aether/contracts';
import type { TourAction } from '../tour.js';
import { useT } from '../ui.js';
import { Agents } from './Agents.js';
import type { OfficeModel } from './office-model.js';

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
        screens={rush ? rush.screens : model.screens}
        intensity={rush ? rush.intensity : model.intensity}
        attention={model.attention}
        autoCamera={prefs.autoCamera}
        onToggleAuto={() => prefs.set({ autoCamera: !prefs.autoCamera })}
        agents={model.agents}
        roleOf={model.roleOf}
        apparitions={model.apparitions}
        zombies={model.zombies}
        branchOf={model.branchOf}
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
