import { lazy, Suspense, type Dispatch, type SetStateAction } from 'react';
import type { Layout, Snapshot } from '@aether/contracts';
import type { OfficeSceneProps } from '@aether/office-scene';
import type { FloorKpiBadge } from '@aether/office-scene/model';
import { mergeLayout } from './layout-merge.js';
import {
  clearIntroReplayRequest,
  introPlayedThisSession,
  introReplayRequested,
  markIntroPlayed,
  phoneRemembersIntro,
  shouldAutoplayIntro,
} from '../../lib/navigation/intro-gate.js';
import { FPS_CAPS, usePreferences } from '../../lib/preferences/state.js';
import { SUBAGENT_INFIX } from '../../lib/sessions/subagent-id.js';
import type { TourAction } from '../../lib/navigation/tour.js';
import { useT } from '../../ui/useT.js';
import type { AttributedSession } from '@aether/contracts';
import type { CharacterCommand } from '../office/CharacterMenu.js';
import { GroupBar } from '../shell-chrome/GroupBar.js';
import { useGitGraph } from '../tasks-git/GitGraph.js';
import type { OfficeModel } from '../office/office-model.js';
import {
  compactPreview,
  introForce,
  perfFrames,
  perfRequested,
  publishPerf,
  rushPreview,
  talkPreview,
  useClockOutPreview,
  useSpeech,
} from '../office/scene-url-previews.js';
import { useCompactPreview, useTalkPreview } from '../office/scene-preview.js';
import { SeatToast } from '../office/SeatToast.js';
import { useSeatMove } from '../office/seat-move.js';
import {
  squadHandover,
  squadLegacy,
  squadLook,
  squadRelation,
  squadStrings,
  useSquadPreview,
} from '../squad/squad-preview.js';
import { useCompactions } from '../conversation/use-compactions.js';
import { useLifeInput } from './use-life.js';
import { useSeats } from './use-seats.js';

export type SceneViewProps = {
  data: Snapshot;
  model: OfficeModel;
  selectedId: string | null;
  focus: string;
  preview: Layout | null;
  unread: ReadonlySet<string>;
  canWrite: boolean;
  compact?: boolean;
  /** Something covers the scene (the phone's full sheet): it stops drawing meanwhile. */
  covered?: boolean;
  floorKpi?: readonly (FloorKpiBadge | null)[];
  onOpenFloorKpi?: (floor: number) => void;
  onSelect: (id: string) => void;
  onOpen: (id: string) => void;
  onFeed: (id: string) => void;
  onTour: (action: TourAction) => void;
  onNotice: (message: string) => void;
  onRefresh: () => void;
};

function useSceneIntro(compact: boolean, covered: boolean): OfficeSceneProps['intro'] {
  const prefs = usePreferences();
  return {
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
}

function useSceneLayout(
  { data, model, preview, onRefresh }: SceneViewProps,
  observed: OfficeModel['observed'],
) {
  const t = useT();
  // Every member keeps its desk while it stays (not the subagents a squad zone seats: they have no desk of their own).
  const seats = useSeats(
    data.project.id,
    [...data.agents, ...observed].filter((a) => squadLegacy || !a.id.includes(SUBAGENT_INFIX)),
    model.floorOf,
  );
  const shown =
    preview ??
    mergeLayout(data.layout?.data ?? null, data.agents, observed, model.floorOf, {
      squads: !squadLegacy,
      seats,
    });
  const seat = useSeatMove({
    projectId: data.project.id,
    saved: data.layout?.data ?? null,
    version: data.layout?.version ?? 0,
    shown,
    liveIds: new Set(model.agents.map((a) => a.id)),
    onRefresh,
    words: { moved: t('seatMoved'), undone: t('seatUndone'), failed: t('seatSaveFailed') },
  });
  return { seat, layout: seat.layout ?? shown };
}

function useSceneModelProps(
  { model, data }: SceneViewProps,
  sessions: readonly AttributedSession[],
  leaving: Record<string, number>,
  squadStandIn: ReturnType<typeof useSquadPreview>,
) {
  const prefs = usePreferences();
  const speech = useSpeech(model, prefs.view === '3d');
  const rush = rushPreview(model.agents);
  const talk = useTalkPreview(model.agents, talkPreview);
  const standIn = useCompactPreview(model.agents, compactPreview);
  const realCompactions = useCompactions(model.contexts);
  const life = useLifeInput(sessions, model, prefs.life);
  const compactionsShown = !prefs.life.calm && prefs.life.categories.work;
  const graph = useGitGraph(data.project.id, prefs.beanstalk && prefs.view === '3d');
  return {
    pulses: talk?.pulses ?? model.pulses,
    tethers: talk?.tethers ?? model.tethers,
    doing: model.doing,
    names: model.names,
    speech,
    screens: standIn?.screens ?? rush?.screens ?? model.screens,
    compactions: standIn?.compactions ?? (compactionsShown ? realCompactions : {}),
    life,
    intensity: rush ? rush.intensity : model.intensity,
    attention: talk?.attention ?? model.attention,
    roleOf: rush ? (a: { id: string }) => rush.roles[a.id] ?? 'generalist' : model.roleOf,
    apparitions: model.apparitions,
    zombies: model.zombies,
    leaving,
    branchOf: talk?.branchOf ?? model.branchOf,
    beanstalk: prefs.beanstalk ? (graph.data?.commits ?? null) : null,
    squads: squadLegacy ? undefined : (squadStandIn?.squads ?? model.squads),
    focus:
      (life.preview?.loop ? undefined : life.preview?.members[0]) ??
      (squadLook && squadStandIn ? squadStandIn.look : undefined),
  };
}

function useScenePreferenceProps(onNotice: (message: string) => void) {
  const t = useT();
  const prefs = usePreferences();
  return {
    // The office-life settings own the Calm switch and the relation toggle; the squad URL preview can only turn relations off.
    squadPrefs: {
      calm: prefs.life.calm,
      relation: prefs.life.relation && squadRelation,
      strings: prefs.strings && squadStrings,
      handover: squadHandover,
    },
    autoCamera: prefs.autoCamera,
    onToggleAuto: () => prefs.set({ autoCamera: !prefs.autoCamera }),
    quality: prefs.quality,
    fpsCap: FPS_CAPS[prefs.fps],
    reducedMotion: prefs.reducedMotion,
    locale: prefs.locale,
    onFailure: () => {
      prefs.set({ view: '2d' });
      onNotice(t('sceneFailed'));
    },
  };
}

const CharacterMenu = lazy(() =>
  import('../office/CharacterMenu.js').then((m) => ({ default: m.CharacterMenu })),
);

function sceneMenus(
  props: SceneViewProps,
  sessions: readonly AttributedSession[],
  leaving: Record<string, number>,
  onCommand: Dispatch<SetStateAction<CharacterCommand | null>>,
): Pick<OfficeSceneProps, 'characterMenu' | 'groupBar'> {
  const { onOpen, onFeed, onNotice, data } = props;
  return {
    characterMenu: (ctx) => (
      <Suspense fallback={null}>
        <CharacterMenu
          ctx={ctx}
          sessions={sessions}
          projectId={data.project.id}
          leaving={leaving[ctx.id] !== undefined}
          onOpen={onOpen}
          onFeed={onFeed}
          onCommand={onCommand}
          onNotice={onNotice}
        />
      </Suspense>
    ),
    groupBar: (ctx) => (
      <GroupBar ctx={ctx} sessions={sessions} onCommand={onCommand} onNotice={onNotice} />
    ),
  };
}

export function useSceneProps(
  props: SceneViewProps,
  sessions: readonly AttributedSession[],
  setCommand: Dispatch<SetStateAction<CharacterCommand | null>>,
): Omit<OfficeSceneProps, 'onContextLost'> {
  const { data, model, unread, canWrite, selectedId, compact = false, covered = false } = props;
  const t = useT();
  const squadStandIn = useSquadPreview(model.agents);
  const observed = [...model.observed, ...(squadStandIn?.agents ?? [])];
  const leaving = useClockOutPreview(model) ?? model.leaving;
  const modelProps = useSceneModelProps(props, sessions, leaving, squadStandIn);
  const { seat, layout } = useSceneLayout(props, observed);
  const intro = useSceneIntro(compact, covered);
  const preferenceProps = useScenePreferenceProps(props.onNotice);
  const { focus, ...rest } = modelProps;
  return {
    ...rest,
    compact,
    paused: covered,
    intro,
    ...(props.floorKpi ? { floorKpi: props.floorKpi } : {}),
    ...(props.onOpenFloorKpi ? { onOpenFloorKpi: props.onOpenFloorKpi } : {}),
    agents: squadStandIn ? [...model.agents, ...squadStandIn.agents] : model.agents,
    unreadIds: new Set([...unread].map((key) => `local:${key}`)),
    layout,
    canArrange: canWrite,
    onMoveSeat: seat.move,
    overlay: seat.toast && <SeatToast toast={seat.toast} onDismiss={seat.dismiss} />,
    selectedId,
    onSelect: props.onSelect,
    focus: focus ?? props.focus,
    messages: data.messages.map((m) => ({
      id: m.id,
      senderId: m.senderId,
      recipientIds: m.deliveries.map((d) => d.recipientId),
    })),
    ...(perfRequested ? { onPerfReport: publishPerf, ...(perfFrames ? { perfFrames } : {}) } : {}),
    onUserCamera: () => props.onTour({ type: 'interrupt' }),
    onMessageUnreachable: () => props.onNotice(t('messageUnreachable')),
    ...preferenceProps,
    ...sceneMenus(props, sessions, leaving, setCommand),
  };
}
