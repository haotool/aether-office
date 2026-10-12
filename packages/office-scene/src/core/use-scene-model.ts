import { useCallback, useMemo, useRef, useState, type RefObject } from 'react';
import type { Agent, Layout } from '@aether/contracts';
import { FLOORS, defaultLayout } from '../environment/layout.js';
import { type StalkHover } from '../components/Beanstalk.js';
import { layoutStalk, spreadStalk } from './stalk-layout.js';
import { EXPLODED_GAP, FLOOR_HEIGHT } from '../environment/building.js';
import { planDepartures } from '../animals/departure.js';
import { sceneRelations } from '../environment/interplay.js';
import { useSceneInteraction, type SceneInteraction } from './use-scene-interaction.js';
import { roleLabel } from '../components/InteractionLayer.js';
import type { Rect } from './multi-view.js';
import { pickSpeakers } from '../environment/speakers.js';
import { pixelRatioCap } from '../perf/perf-control.js';
import { usePoseCues } from './use-pose-cues.js';
import { ACTIVE, departmentAt, floorOfDesk, floorY } from '../scene/scene-geometry.js';
import { useSceneNavigation } from '../scene/scene-navigation.js';
import { useIntroTour } from '../intro/index.js';
import { useAriaLog } from '../life/index.js';
import { useSquad } from '../squad/index.js';
import type { OfficeSceneProps } from '../scene/scene-props.js';

function useHover() {
  const [hovered, setHovered] = useState<string | null>(null);
  const hoverStart = (id: string) => setHovered(id);
  const hoverEnd = (id: string) => setHovered((h) => (h === id ? null : h));
  return { hovered, hoverStart, hoverEnd };
}

function useStalk(beanstalk: OfficeSceneProps['beanstalk'], exploded: boolean) {
  const stalk = useMemo(
    () => (beanstalk?.length ? layoutStalk(beanstalk, Date.now(), FLOORS * FLOOR_HEIGHT) : null),
    [beanstalk],
  );
  const spire = useMemo(
    () =>
      stalk && exploded
        ? spreadStalk(stalk, { floorHeight: FLOOR_HEIGHT, gap: EXPLODED_GAP })
        : stalk,
    [stalk, exploded],
  );
  const tip = useRef<((hover: StalkHover) => void) | null>(null);
  const showTip = useCallback((hover: StalkHover) => tip.current?.(hover), []);
  return { stalk, spire, tip, showTip };
}

function useNavigation(props: OfficeSceneProps, layout: Layout, intro: Intro, compact: boolean) {
  const attention = useMemo(
    () => new Map(Object.entries(props.attention ?? {})),
    [props.attention],
  );
  const intensity = useMemo(
    () => new Map(Object.entries(props.intensity ?? {})),
    [props.intensity],
  );
  return useSceneNavigation({
    agents: props.agents,
    layout,
    focus: props.focus,
    onUserCamera: props.onUserCamera,
    onToggleAuto: props.onToggleAuto,
    pulses: props.pulses ?? [],
    attention,
    intensity,
    directing: (props.autoCamera ?? true) && !props.reducedMotion,
    resumeMs: compact ? 10_000 : 30_000,
    selectedId: props.selectedId,
    intro,
  });
}
type Intro = ReturnType<typeof useIntroTour>;

function useSceneCore(props: OfficeSceneProps) {
  const placed = useMemo(
    () => props.layout ?? defaultLayout(props.agents),
    [props.layout, props.agents],
  );
  const zh = props.locale === 'zh-TW';
  const compact = props.compact ?? false;
  const ariaLog = useAriaLog(zh);
  const pose = usePoseCues(props.reducedMotion);
  const squad = useSquad(placed, props, ariaLog.say, pose.request);
  const layout = squad.layout;
  const [warm, setWarm] = useState(false);
  const ready = useCallback(() => setWarm(true), []);
  const intro = useIntroTour({
    props: props.intro,
    warm,
    reducedMotion: props.reducedMotion,
    agents: props.agents,
    layout,
    commits: props.beanstalk?.length ?? 0,
    selectedId: props.selectedId,
    focus: props.focus,
  });
  const nav = useNavigation(props, layout, intro, compact);
  return { placed, zh, compact, ariaLog, pose, squad, layout, warm, ready, intro, nav };
}

function floorsInView(agents: Agent[], layout: Layout, floor: number, exploded: boolean) {
  const count = exploded ? FLOORS : floor + 1;
  return {
    visibleFloors: Array.from({ length: count }, (_, i) => i),
    sceneAgents: agents.filter((agent) => exploded || floorOfDesk(layout, agent.id) === floor),
  };
}

function renderSettings(props: OfficeSceneProps, compact: boolean) {
  const animate = !props.reducedMotion && props.quality !== 'low';
  return {
    maxRatio: pixelRatioCap(props.quality, compact),
    shadowsOn: !compact && props.quality !== 'low',
    animate,
    active:
      animate || (props.agents.some((a) => ACTIVE.includes(a.activity)) && !props.reducedMotion),
  };
}

type Core = ReturnType<typeof useSceneCore>;

function useInteraction(
  props: OfficeSceneProps,
  core: Core,
  sceneAgents: Agent[],
  hovered: string | null,
  elements: RefObject<Map<string, HTMLElement>>,
) {
  const { zh, compact, layout, nav, pose } = core;
  return useSceneInteraction({
    zh,
    compact,
    layout,
    nav,
    sceneAgents,
    agents: props.agents,
    selectedId: props.selectedId,
    onSelect: props.onSelect,
    hovered,
    tags: elements,
    roleOf: props.roleOf,
    screens: props.screens,
    doing: props.doing,
    intensity: props.intensity,
    apparitions: props.apparitions,
    leaving: props.leaving,
    quality: props.quality,
    reducedMotion: props.reducedMotion,
    canArrange: props.canArrange ?? false,
    onMoveSeat: props.onMoveSeat,
    hasGroupBar: !!props.groupBar,
    pose: pose.request,
  });
}

function useFloorFrame(layout: Layout, floor: number, exploded: boolean) {
  const floorLayout = useMemo(
    () => ({ ...layout, objects: layout.objects.filter((o) => (o.floor ?? 0) === floor) }),
    [layout, floor],
  );
  return { y: floorY(floor, exploded), floorLayout, department: departmentAt(floor) };
}

type Labelling = {
  props: OfficeSceneProps;
  zh: boolean;
  compact: boolean;
  namesOn: boolean;
  hovered: string | null;
  marks: SceneInteraction['marks'];
  onShot: (id: string) => boolean;
  sceneAgents: Agent[];
};

function labelling(l: Labelling) {
  const { props, marks } = l;
  return {
    named: (agent: Agent) =>
      l.namesOn ||
      agent.id === props.selectedId ||
      agent.id === l.hovered ||
      agent.id === marks.menuId ||
      marks.group.has(agent.id) ||
      (!l.compact && l.onShot(agent.id)),
    roleName: (agent: Agent) => roleLabel(props.roleOf?.(agent) ?? 'generalist', l.zh),
    chipped: props.quality === 'low' ? [] : l.sceneAgents.filter((a) => props.compactions?.[a.id]),
  };
}

function useDomRegistry() {
  const elements = useRef(new Map<string, HTMLElement>());
  const speechElements = useRef(new Map<string, HTMLElement>());
  const chipElements = useRef(new Map<string, HTMLElement>());
  const bubbles = useRef(new Map<string, Rect>());
  return { elements, speechElements, chipElements, bubbles };
}

function relationsOf(
  props: OfficeSceneProps,
  nav: ReturnType<typeof useSceneCore>['nav'],
  sceneAgents: readonly Agent[],
  hovered: string | null,
) {
  const { floor, exploded } = nav;
  return sceneRelations({
    pulses: props.pulses ?? [],
    seats: nav.seats,
    agents: sceneAgents,
    branchOf: props.branchOf,
    tethers: props.tethers ?? [],
    focus: hovered ?? props.selectedId,
    heightOf: (f) => floorY(f, exploded),
    visible: (f) => exploded || f === floor,
  });
}

function useDepartures(layout: Layout, leaving: OfficeSceneProps['leaving']) {
  return useMemo(() => planDepartures(layout, Object.keys(leaving ?? {})), [layout, leaving]);
}

const speakersOf = (
  props: OfficeSceneProps,
  sceneAgents: readonly Agent[],
  onShot: (id: string) => boolean,
  compact: boolean,
) =>
  pickSpeakers({
    agents: sceneAgents,
    speech: props.speech,
    intensity: props.intensity,
    selectedId: props.selectedId,
    onShot,
    compact,
  });

function useCrowd(
  props: OfficeSceneProps,
  core: ReturnType<typeof useSceneCore>,
  elements: ReturnType<typeof useDomRegistry>['elements'],
  hovered: string | null,
) {
  const { layout, nav, compact, zh } = core;
  const { floor, exploded } = nav;
  const [namesOn, setNamesOn] = useState(!compact);
  const departures = useDepartures(layout, props.leaving);
  const { visibleFloors, sceneAgents } = floorsInView(props.agents, layout, floor, exploded);
  const ix = useInteraction(props, core, sceneAgents, hovered, elements);
  const onShot = (id: string) => nav.directed?.shot.subjects.includes(id) ?? false;
  const { engagements, edges } = relationsOf(props, nav, sceneAgents, hovered);
  const speakers = speakersOf(props, sceneAgents, onShot, compact);
  const marks = ix.marks;
  return {
    ...labelling({ props, zh, compact, namesOn, hovered, marks, onShot, sceneAgents }),
    namesOn,
    setNamesOn,
    departures,
    visibleFloors,
    sceneAgents,
    ix,
    onShot,
    engagements,
    edges,
    speakers,
  };
}

export function useSceneModel(props: OfficeSceneProps) {
  const core = useSceneCore(props);
  const { layout, nav, pose, compact, zh, intro } = core;
  const { floor, exploded } = nav;
  const { hovered, hoverStart, hoverEnd } = useHover();
  const dom = useDomRegistry();
  const stalk = useStalk(props.beanstalk, exploded);
  const frame = useFloorFrame(layout, floor, exploded);
  const crowd = useCrowd(props, core, dom.elements, hovered);
  const { ix, engagements } = crowd;
  return {
    props,
    ...core,
    ...dom,
    ...renderSettings(props, compact),
    ...stalk,
    ...frame,
    floor,
    exploded,
    hovered,
    hoverStart,
    hoverEnd,
    ...crowd,
    filming: nav.directed !== null || intro.active,
    auto: (props.autoCamera ?? true) && !props.reducedMotion,
    squadScene: {
      props,
      floor,
      exploded,
      compact,
      zh,
      hover: { id: hovered, start: hoverStart, end: hoverEnd },
      ix,
      pose,
      fly: nav.fly,
      engagements,
      elements: dom.elements.current,
    },
  };
}

export type SceneModel = ReturnType<typeof useSceneModel>;
