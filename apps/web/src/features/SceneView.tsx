import { lazy, Suspense, useState } from 'react';
import { Orbit } from 'lucide-react';
import type { Snapshot } from '@aether/contracts';
import {
  STAGGER_MS,
  type FloorKpiBadge,
  type PerfReport,
  type SceneSpeech,
} from '@aether/office-scene/model';
import { LOCAL_PREFIX, mergeLayout } from '../localSessions.js';
import {
  clearIntroReplayRequest,
  introForced,
  introReplayRequested,
  introPlayedThisSession,
  markIntroPlayed,
  phoneRemembersIntro,
  shouldAutoplayIntro,
} from '../intro-gate.js';
import { usePreferences } from '../state.js';
import type { Layout } from '@aether/contracts';
import type { TourAction } from '../tour.js';
import { useT } from '../ui.js';
import { Agents } from './Agents.js';
import { useCachedSessions } from './character-session.js';
import { CharacterCommands } from './CharacterCommands.js';
import { CharacterMenu, type CharacterCommand } from './CharacterMenu.js';
import { GroupBar } from './GroupBar.js';
import { SeatToast } from './SeatToast.js';
import { useSeatMove } from './seat-move.js';
import { useGitGraph } from './GitGraph.js';
import type { OfficeModel } from './office-model.js';
import { useCompactions } from './use-compactions.js';
import { standInFacts, standInRole, useCompactPreview, useTalkPreview } from './scene-preview.js';
import { useLifeInput } from './use-life.js';
import {
  squadLegacy,
  squadLook,
  squadHandover,
  squadRelation,
  squadStrings,
  useSquadPreview,
} from './squad-preview.js';
import { useSpeechBySession } from './use-session-feed.js';

const OfficeScene = lazy(() =>
  import('@aether/office-scene').then((m) => ({ default: m.OfficeScene })),
);

// Opt-in measurement: `?perf=1` renders a fixed sample of frames and exposes the measured result.
const perfRequested = new URLSearchParams(window.location.search).has('perf');
// `?perf=600` samples 600 frames instead of the default 120 (`?perf=1` is only the flag).
const perfParam = Number(new URLSearchParams(window.location.search).get('perf'));
const perfFrames = perfParam > 1 ? perfParam : 0;
function publishPerf(report: PerfReport) {
  const w = window as unknown as { __aetherPerf?: PerfReport; __aetherPerfHistory?: PerfReport[] };
  w.__aetherPerf = report;
  (w.__aetherPerfHistory ??= []).push(report); // one report per scene mount
}

// `?intro=force` plays the first-visit camera tour whatever the preference, the session or automation say (the tests' switch).
const introForce = introForced(window.location.search);

// Opt-in preview: `?intensity=3` shows every member working at that level, with a stand-in screen, to look at the effects
// (faster typing, streaming screens, smoke) without a hundred busy sessions. Never used otherwise.
const rushRequested = Number(new URLSearchParams(window.location.search).get('intensity') ?? '');

// Opt-in preview: `?compact=1` fills every member's context and compacts it every few seconds, with stand-in screens (see scene-preview.ts).
const compactPreview = new URLSearchParams(window.location.search).has('compact');

// Opt-in preview: `?talk=1` shows stand-in messages, tethers, threads and attention rings (see scene-preview.ts).
const talkPreview = new URLSearchParams(window.location.search).has('talk');

// Opt-in preview: `?speech=1` gives every member a stand-in prompt and reply, to look at the bubbles without real sessions.
const speechPreview = new URLSearchParams(window.location.search).has('speech');
const STAND_IN_SPEECH: SceneSpeech = {
  user: { text: 'Preview prompt: add a retry to the upload and cover it with a test.', at: null },
  assistant: {
    text: '**Preview reply, done:**\n- the upload retries **three times** with a backoff in `upload.ts`\n- test added: `retries.test.ts`\n- 已移除 16 個分支，只動分支與暫存\n\n## Next\nrun the full suite and open the PR',
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
    Object.entries(speech ?? {}).map(([key, value]) => [`${LOCAL_PREFIX}${key}`, value]),
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
  covered = false,
  floorKpi,
  onOpenFloorKpi,
  onSelect,
  onOpen,
  onFeed,
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
  /** Something covers the scene (the phone's full sheet): it stops drawing meanwhile. */
  covered?: boolean;
  /** Each floor's KPI badge (index = floor) for the floor switcher and the floor's plaque. */
  floorKpi?: readonly (FloorKpiBadge | null)[];
  onOpenFloorKpi?: (floor: number) => void;
  onSelect: (id: string) => void;
  /** Open a member's conversation (the panel, or the full sheet on a phone). */
  onOpen: (id: string) => void;
  /** Show a member's row in the feed (clears the choice). */
  onFeed: (id: string) => void;
  onTour: (action: TourAction) => void;
  onNotice: (message: string) => void;
  onRefresh: () => void;
}) {
  const t = useT();
  const sessions = useCachedSessions();
  const [command, setCommand] = useState<CharacterCommand | null>(null);
  const prefs = usePreferences();
  const intro = {
    auto:
      !covered &&
      shouldAutoplayIntro({
        pref: prefs.intro,
        playedThisSession: introPlayedThisSession(),
        automated: navigator.webdriver,
        force: introForce || introReplayRequested(),
      }),
    onDone: () => {
      clearIntroReplayRequest();
      markIntroPlayed();
      if (phoneRemembersIntro(compact, introForce)) prefs.set({ intro: 'never' });
    },
    onNever: () => prefs.set({ intro: 'never' }),
  };
  // The office-life settings own the Calm switch and the relation toggle; the squad URL preview can only turn relations off.
  const squadPrefs = {
    calm: prefs.life.calm,
    relation: prefs.life.relation && squadRelation,
    strings: prefs.strings && squadStrings,
    handover: squadHandover,
  };
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
            model.agents.map((a, i) => [a.id, standInFacts(a, i % 2 ? 'codex' : 'claude', 40, i)]),
          ),
          roles: Object.fromEntries(model.agents.map((a, i) => [a.id, standInRole(i)])),
        }
      : null;
  const realCompactions = useCompactions(model.contexts);
  // Office life: decorative moments from real signals. Compaction is one of them (the "work" kind), so Calm mode and its switch apply.
  const life = useLifeInput(sessions, model, prefs.life);
  const compactionsShown = !prefs.life.calm && prefs.life.categories.work;
  const standIn = useCompactPreview(model.agents, compactPreview);
  const talk = useTalkPreview(model.agents, talkPreview);
  const squadStandIn = useSquadPreview(model.agents);
  const agents = squadStandIn ? [...model.agents, ...squadStandIn.agents] : model.agents;
  const shown =
    preview ??
    mergeLayout(
      data.layout?.data ?? null,
      data.agents,
      [...model.observed, ...(squadStandIn?.agents ?? [])],
      model.floorOf,
      {
        squads: !squadLegacy, // subagents sit in their supervisor's squad zone, not at desks of their own
      },
    );
  const seat = useSeatMove({
    projectId: data.project.id,
    saved: data.layout?.data ?? null,
    version: data.layout?.version ?? 0,
    shown,
    liveIds: new Set(model.agents.map((a) => a.id)),
    onRefresh,
    words: { moved: t('seatMoved'), undone: t('seatUndone'), failed: t('seatSaveFailed') },
  });
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
        paused={covered}
        intro={intro}
        squads={squadLegacy ? undefined : (squadStandIn?.squads ?? model.squads)}
        squadPrefs={squadPrefs}
        {...(floorKpi ? { floorKpi } : {})}
        {...(onOpenFloorKpi ? { onOpenFloorKpi } : {})}
        pulses={talk?.pulses ?? model.pulses}
        tethers={talk?.tethers ?? model.tethers}
        doing={model.doing}
        names={model.names}
        speech={speech}
        screens={standIn?.screens ?? rush?.screens ?? model.screens}
        compactions={standIn?.compactions ?? (compactionsShown ? realCompactions : {})}
        life={life}
        intensity={rush ? rush.intensity : model.intensity}
        attention={talk?.attention ?? model.attention}
        autoCamera={prefs.autoCamera}
        onToggleAuto={() => prefs.set({ autoCamera: !prefs.autoCamera })}
        agents={agents}
        roleOf={rush ? (a) => rush.roles[a.id] ?? 'generalist' : model.roleOf}
        apparitions={model.apparitions}
        zombies={model.zombies}
        leaving={leaving}
        branchOf={talk?.branchOf ?? model.branchOf}
        beanstalk={prefs.beanstalk ? (graph.data?.commits ?? null) : null}
        unreadIds={new Set([...unread].map((key) => `local:${key}`))}
        layout={seat.layout ?? shown}
        canArrange={canWrite}
        onMoveSeat={seat.move}
        overlay={seat.toast && <SeatToast toast={seat.toast} onDismiss={seat.dismiss} />}
        characterMenu={(ctx) => (
          <CharacterMenu
            ctx={ctx}
            sessions={sessions}
            projectId={data.project.id}
            leaving={leaving[ctx.id] !== undefined}
            onOpen={onOpen}
            onFeed={onFeed}
            onCommand={setCommand}
            onNotice={onNotice}
          />
        )}
        groupBar={(ctx) => (
          <GroupBar ctx={ctx} sessions={sessions} onCommand={setCommand} onNotice={onNotice} />
        )}
        selectedId={selectedId}
        onSelect={onSelect}
        quality={prefs.quality}
        reducedMotion={prefs.reducedMotion}
        locale={prefs.locale}
        focus={
          (life.preview?.loop ? undefined : life.preview?.members[0]) ??
          (squadLook && squadStandIn ? squadStandIn.look : focus)
        }
        messages={sceneMessages}
        {...(perfRequested
          ? { onPerfReport: publishPerf, ...(perfFrames ? { perfFrames } : {}) }
          : {})}
        onUserCamera={() => onTour({ type: 'interrupt' })}
        onMessageUnreachable={() => onNotice(t('messageUnreachable'))}
        onFailure={() => {
          prefs.set({ view: '2d' });
          onNotice(t('sceneFailed'));
        }}
      />
      <CharacterCommands
        command={command}
        sessions={sessions}
        locale={prefs.locale}
        onClose={() => setCommand(null)}
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
