import type { Dispatch, SetStateAction } from 'react';
import type { Layout, Snapshot } from '@aether/contracts';
import type { OfficeSceneProps } from '@aether/office-scene';
import type { FloorKpiBadge } from '@aether/office-scene/model';
import { mergeLayout } from '../localSessions.js';
import {
  clearIntroReplayRequest,
  introPlayedThisSession,
  introReplayRequested,
  markIntroPlayed,
  phoneRemembersIntro,
  shouldAutoplayIntro,
} from '../intro-gate.js';
import { usePreferences } from '../state.js';
import { SUBAGENT_INFIX } from '../subagent-id.js';
import type { TourAction } from '../tour.js';
import { useT } from '../ui.js';
import type { AttributedSession } from '@aether/contracts';
import { CharacterMenu, type CharacterCommand } from './CharacterMenu.js';
import { GroupBar } from './GroupBar.js';
import { useGitGraph } from './GitGraph.js';
import type { OfficeModel } from './office-model.js';
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
} from './scene-url-previews.js';
import { useCompactPreview, useTalkPreview } from './scene-preview.js';
import { SeatToast } from './SeatToast.js';
import { useSeatMove } from './seat-move.js';
import {
  squadHandover,
  squadLegacy,
  squadLook,
  squadRelation,
  squadStrings,
  useSquadPreview,
} from './squad-preview.js';
import { useCompactions } from './use-compactions.js';
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
};

/** The first-visit camera tour: whether it plays by itself and what finishing or declining it remembers. */
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

/** Where everyone sits: the saved layout (or the preview being edited) merged with the members, and moving a seat. */
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
      squads: !squadLegacy, // subagents sit in their supervisor's squad zone, not at desks of their own
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

/** Everything the scene is told besides the layout: the model's own parts, or the URL previews' stand-ins. */
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
  // Office life: decorative moments from real signals. Compaction is one of them (the "work" kind), so Calm mode and its switch apply.
  const life = useLifeInput(sessions, model, prefs.life);
  const compactionsShown = !prefs.life.calm && prefs.life.categories.work;
  // No repository (or no access to it) means no beanstalk: the query just fails quietly.
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

/** What the preferences decide for the scene, and the fall back to the 2D list when it fails. */
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
    reducedMotion: prefs.reducedMotion,
    locale: prefs.locale,
    onFailure: () => {
      prefs.set({ view: '2d' });
      onNotice(t('sceneFailed'));
    },
  };
}

/** The menu over a character and the bar over a selected group. */
function sceneMenus(
  props: SceneViewProps,
  sessions: readonly AttributedSession[],
  leaving: Record<string, number>,
  onCommand: Dispatch<SetStateAction<CharacterCommand | null>>,
): Pick<OfficeSceneProps, 'characterMenu' | 'groupBar'> {
  const { onOpen, onFeed, onNotice, data } = props;
  return {
    characterMenu: (ctx) => (
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
    ),
    groupBar: (ctx) => (
      <GroupBar ctx={ctx} sessions={sessions} onCommand={onCommand} onNotice={onNotice} />
    ),
  };
}

/** The scene's props from the office model, the preferences and the people's actions on it. */
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
    // Recomputed per render on purpose: MessageCarriers dedupes by messageId, so identity does not matter.
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
