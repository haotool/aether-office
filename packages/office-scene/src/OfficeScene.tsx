import { MultiCam } from './MultiCam.js';
import { PipWall } from './PipWall.js';
import { chooseFeeds, feedCapacity, type Feed, type Rect } from './multi-view.js';
import type { ScreenFacts } from './screen-facts.js';
import { useCallback, useMemo, useRef, useState } from 'react';
import { Canvas } from '@react-three/fiber';
import type { Agent, Layout } from '@aether/contracts';
import { DEPARTMENTS } from '@aether/kernel';
import { FLOORS, defaultLayout, floorZones } from './layout.js';
import { OrbitalBackdrop } from './OrbitalBackdrop.js';
import type { Apparition } from './animal-states.js';
import { Beanstalk, type StalkHover } from './Beanstalk.js';
import { layoutStalk, spreadStalk, type StalkCommit } from './stalk-layout.js';
import { EXPLODED_GAP, FLOOR_HEIGHT } from './building.js';
import { BranchBeams } from './BranchBeams.js';
import { planDepartures } from './departure.js';
import { CommLinks } from './CommLinks.js';
import type { Pulse } from './director.js';
import { Floor } from './Floor.js';
import { Beacons, ProjectedLabels } from './Labels.js';
import { Member } from './Member.js';
import { ProjectedSpeech, SpeechLayer, type SceneSpeech } from './Speech.js';
import { MessageCarriers } from './MessageCarriers.js';
import { PerfProbe } from './PerfProbe.js';
import { SceneCamera } from './SceneCamera.js';
import { StalkTooltip } from './StalkTooltip.js';
import { CompactHud } from './CompactHud.js';
import { BuildingPanel, FloorHud, ShotCaption } from './SceneHud.js';
import { AnimationClock, Runtime, SceneBoundary } from './SceneRuntime.js';
import { ACTIVE, OVERVIEW, ZONE_OFFSET, floorOfDesk, floorY } from './scene-geometry.js';
import { beaconsOf, beamsOf, labelsOf } from './scene-markers.js';
import { useSceneNavigation } from './scene-navigation.js';
import type { BranchInfo, Quality } from './scene-types.js';
import type { PerfReport } from './perf.js';
import type { SceneMessage } from './carriers.js';

const SPEECH_AT_ONCE = 6;

export type OfficeSceneProps = {
  agents: Agent[];
  layout: Layout | null;
  selectedId: string | null;
  onSelect: (id: string) => void;
  quality: Quality;
  reducedMotion: boolean;
  locale: 'zh-TW' | 'en';
  focus: string;
  onFailure: () => void;
  messages?: readonly SceneMessage[];
  onMessageUnreachable?: (messageId: string, recipientId: string) => void;
  /** Fired when the user drags, zooms or pans the camera, so automation like a tour can yield. */
  onUserCamera?: () => void;
  /** Which engineering role an agent works in; picks the art on its screen. */
  roleOf?: (agent: Agent) => string;
  /** What each member is really doing, by id: drawn on that member's screen instead of the role's decorative art. */
  screens?: Readonly<Record<string, ScreenFacts>>;
  /** How hard each working member is working, 0 to 3: faster typing, a streaming screen, and at the top a machine that smokes. */
  intensity?: Readonly<Record<string, 0 | 1 | 2 | 3>>;
  /** The Git branch an agent works on, drawn as a beam from its desk into the core (the default branch). */
  branchOf?: (agent: Agent) => BranchInfo | null;
  /** Members drawn as something else at their own seat: a sleeping rabbit, a ghost, a jiangshi (see animal-states). */
  apparitions?: Readonly<Record<string, Apparition>>;
  /** Members with zombie processes under them (id → how many): a jiangshi stands behind each one's chair as well. */
  zombies?: Readonly<Record<string, number>>;
  /** Members sent home, by id with the wall-clock moment each begins to leave: they pack up, walk to the elevator and are gone. */
  leaving?: Readonly<Record<string, number>>;
  /** Agents with something new for the user (waiting for them, or finished): their labels are marked. */
  unreadIds?: ReadonlySet<string>;
  /** Messages and subagent work in the last half minute: drawn between the members and cut to by the camera. */
  pulses?: readonly Pulse[];
  /** Members that want a person (forgotten, ownerless, zombies under them), by id with the reason in a few words. */
  attention?: Readonly<Record<string, string>>;
  /** What each member is doing right now, in a word or two (a tool, a state), shown by the member on screen. */
  doing?: Readonly<Record<string, string>>;
  /** The last prompt and reply of each running member, by id: two bubbles over the head of a few of them at a time. */
  speech?: Readonly<Record<string, SceneSpeech>>;
  /** Recent commits of the project's repository, newest first: drawn as a braid of glass up the building's core with a crown above the roof. */
  beanstalk?: readonly StalkCommit[] | null;
  /** The camera runs itself (the director). Default on. */
  autoCamera?: boolean;
  onToggleAuto?: () => void;
  /** A phone: lighter rendering (no shadows, no antialiasing, a capped pixel ratio), few names and a minimal HUD. */
  compact?: boolean;
  /** When set, the scene renders continuously for a fixed sample and reports measured frame times. */
  onPerfReport?: (report: PerfReport) => void;
};

export function OfficeScene(props: OfficeSceneProps) {
  const layout = useMemo(
    () => props.layout ?? defaultLayout(props.agents),
    [props.layout, props.agents],
  );
  const zh = props.locale === 'zh-TW';
  const elements = useRef(new Map<string, HTMLElement>());
  const speechElements = useRef(new Map<string, HTMLElement>());
  const [hovered, setHovered] = useState<string | null>(null);
  const compact = props.compact ?? false;
  // Names over the scene hide what is behind them: on a phone only the member in hand has one, until asked for all.
  const [namesOn, setNamesOn] = useState(!compact);
  const hoverStart = (id: string) => setHovered(id);
  const hoverEnd = (id: string) => setHovered((h) => (h === id ? null : h));
  const nav = useSceneNavigation({
    agents: props.agents,
    layout,
    focus: props.focus,
    onUserCamera: props.onUserCamera,
    onToggleAuto: props.onToggleAuto,
    pulses: props.pulses ?? [],
    attention: useMemo(() => new Map(Object.entries(props.attention ?? {})), [props.attention]),
    intensity: useMemo(() => new Map(Object.entries(props.intensity ?? {})), [props.intensity]),
    directing: (props.autoCamera ?? true) && !props.reducedMotion,
    resumeMs: compact ? 10_000 : 30_000,
    selectedId: props.selectedId,
  });
  const { floor, exploded } = nav;
  const departures = useMemo(
    () => planDepartures(layout, Object.keys(props.leaving ?? {})),
    [layout, props.leaving],
  );
  // The spire is laid out from the commits; its tooltip is fed by the spire's pointer events without redrawing the scene.
  const stalk = useMemo(
    () =>
      props.beanstalk?.length
        ? layoutStalk(props.beanstalk, Date.now(), FLOORS * FLOOR_HEIGHT)
        : null,
    [props.beanstalk],
  );
  const spire = useMemo(
    () =>
      stalk && exploded
        ? spreadStalk(stalk, { floorHeight: FLOOR_HEIGHT, gap: EXPLODED_GAP })
        : stalk,
    [stalk, exploded],
  );
  const stalkTip = useRef<((hover: StalkHover) => void) | null>(null);
  const showStalkTip = useCallback((hover: StalkHover) => stalkTip.current?.(hover), []);
  // Several members busy at once: the main camera is on one, the others get a small view each beside it.
  const [pipsHidden, setPipsHidden] = useState(false);
  const feedsRef = useRef<Feed[]>([]);
  // Where the small views are on the canvas (MultiCam writes it), and how much room the canvas has for them.
  const wall = useRef<ReadonlyMap<string, Rect>>(new Map());
  // Where the speech bubbles are drawn this frame: a name tag under one is hidden, not drawn over what the member said.
  const bubbles = useRef(new Map<string, Rect>());
  const [canvasSize, setCanvasSize] = useState({ width: 0, height: 0 });
  const container = useCallback((node: HTMLDivElement | null) => {
    if (!node) return;
    const measure = () => setCanvasSize({ width: node.clientWidth, height: node.clientHeight });
    const observer = new ResizeObserver(measure);
    observer.observe(node);
    measure();
    return () => observer.disconnect();
  }, []);
  const wantPips = !compact && props.quality !== 'low' && !props.reducedMotion && !pipsHidden;
  const mainSubjects = nav.directed?.shot.subjects.join('|') ?? '';
  const feeds = useMemo(() => {
    if (!wantPips) return [];
    const taken = new Set(mainSubjects ? mainSubjects.split('|') : []);
    if (props.selectedId) taken.add(props.selectedId);
    feedsRef.current = chooseFeeds({
      agents: props.agents,
      seats: nav.seats,
      intensity: new Map(Object.entries(props.intensity ?? {})),
      taken,
      previous: feedsRef.current,
      max: feedCapacity(canvasSize.width, canvasSize.height),
      ...(exploded ? {} : { floor }), // a member on a floor that is not drawn would have an empty view
    });
    return feedsRef.current;
  }, [
    wantPips,
    props.agents,
    nav.seats,
    props.intensity,
    mainSubjects,
    props.selectedId,
    canvasSize,
    floor,
    exploded,
  ]);
  const auto = (props.autoCamera ?? true) && !props.reducedMotion;
  const onShot = (id: string) => nav.directed?.shot.subjects.includes(id) ?? false;
  const named = (agent: Agent) =>
    namesOn ||
    agent.id === props.selectedId ||
    agent.id === hovered ||
    (!compact && onShot(agent.id)); // on a phone the caption names who the camera is on

  const visibleFloors = exploded
    ? Array.from({ length: FLOORS }, (_, i) => i)
    : Array.from({ length: floor + 1 }, (_, i) => i);
  const sceneAgents = props.agents.filter(
    (agent) => exploded || floorOfDesk(layout, agent.id) === floor,
  );
  // Bubbles go to the selected member and the camera's subjects first, then the busiest working ones (not on a phone).
  const speakers = sceneAgents
    .filter((a) => props.speech?.[a.id])
    .map((a) => {
      const level = props.intensity?.[a.id] ?? 0;
      const rank =
        a.id === props.selectedId || onShot(a.id)
          ? 4
          : compact
            ? 0
            : Math.max(level, a.activity === 'working' ? 1 : 0);
      return { agent: a, rank };
    })
    .filter((s) => s.rank > 0)
    .sort((a, b) => b.rank - a.rank)
    .slice(0, SPEECH_AT_ONCE)
    .map((s) => s.agent);

  const animate = !props.reducedMotion && props.quality !== 'low';
  const active =
    animate || (props.agents.some((a) => ACTIVE.includes(a.activity)) && !props.reducedMotion);
  const y = floorY(floor, exploded);
  const floorLayout = useMemo(
    () => ({ ...layout, objects: layout.objects.filter((o) => (o.floor ?? 0) === floor) }),
    [layout, floor],
  );
  const department = DEPARTMENTS[floor]!;

  return (
    <SceneBoundary onFailure={props.onFailure}>
      <div className="canvas-container" ref={container}>
        <Canvas
          shadows={!compact && props.quality !== 'low'}
          camera={{ position: OVERVIEW(false), fov: 38, near: 0.4, far: 2400 }}
          frameloop="demand"
          dpr={
            props.quality === 'high'
              ? [1, compact ? 1.5 : 2]
              : props.quality === 'balanced'
                ? [1, 1.5]
                : 1
          }
          gl={{
            antialias: !compact && props.quality !== 'low',
            powerPreference: 'high-performance',
            alpha: false,
          }}
        >
          <color attach="background" args={['#050e15']} />
          <fog attach="fog" args={['#050e15', 170, 520]} />
          <OrbitalBackdrop low={compact || props.quality === 'low'} />
          <ambientLight intensity={0.95} color="#9fd8ff" />
          <hemisphereLight args={['#cfeeff', '#25414d', 1.7]} />
          <group position={[0, y, 0]}>
            <directionalLight
              position={[-25, 40, 15]}
              intensity={2.4}
              color="#e8f6ff"
              castShadow={!compact && props.quality !== 'low'}
              shadow-mapSize={props.quality === 'high' ? 4096 : 2048}
              shadow-camera-left={-38}
              shadow-camera-right={38}
              shadow-camera-top={30}
              shadow-camera-bottom={-30}
              shadow-camera-far={110}
              shadow-normalBias={0.05}
            />
            <directionalLight position={[20, 15, -20]} intensity={1.2} color={department.accent} />
          </group>
          {visibleFloors.map((index) => (
            <Floor
              key={index}
              layout={layout}
              floor={index}
              y={floorY(index, exploded)}
              animate={animate && (exploded || index === floor)}
              detail={props.quality === 'high'}
            />
          ))}
          {sceneAgents.map((agent) => {
            const desk = layout.objects.find((o) => o.agentId === agent.id);
            if (!desk) return null;
            return (
              <Member
                key={agent.id}
                agent={agent}
                desk={desk}
                exploded={exploded}
                role={props.roleOf?.(agent) ?? 'generalist'}
                facts={props.screens?.[agent.id]}
                intensity={props.intensity?.[agent.id] ?? 0}
                apparition={props.apparitions?.[agent.id]}
                zombie={(props.zombies?.[agent.id] ?? 0) > 0}
                departure={
                  departures[agent.id] && props.leaving?.[agent.id] !== undefined
                    ? { plan: departures[agent.id]!, startAt: props.leaving[agent.id]! }
                    : undefined
                }
                selected={agent.id === props.selectedId || agent.id === hovered}
                reducedMotion={props.reducedMotion}
                quality={props.quality}
                light={compact}
                onSelect={props.onSelect}
                onFly={nav.fly}
                onHoverStart={hoverStart}
                onHoverEnd={hoverEnd}
                onFailure={props.onFailure}
              />
            );
          })}
          <group position={[0, y, 0]}>
            <MessageCarriers
              layout={floorLayout}
              messages={props.messages ?? []}
              reducedMotion={props.reducedMotion}
              onUnreachable={props.onMessageUnreachable}
            />
          </group>
          <ProjectedLabels
            labels={labelsOf(sceneAgents.filter(named), layout, floor, exploded && !compact)}
            elements={elements.current}
            selected={props.selectedId}
            avoid={wall}
            covered={bubbles}
          />
          <ProjectedSpeech
            anchors={labelsOf(speakers, layout, floor, exploded && !compact)}
            elements={speechElements.current}
            drawn={bubbles}
          />
          <SceneCamera
            command={nav.command}
            reducedMotion={props.reducedMotion}
            onUserCamera={nav.userCamera}
            keyboardRef={nav.keys}
            directed={nav.directed}
            seats={nav.seats}
          />
          <CommLinks
            pulses={props.pulses ?? []}
            seats={nav.seats}
            heightOf={(f) => floorY(f, exploded)}
            visible={(f) => exploded || f <= floor}
          />
          <Runtime onFailure={props.onFailure} />
          {props.onPerfReport && (
            <PerfProbe quality={props.quality} onReport={props.onPerfReport} />
          )}
          {props.branchOf && (
            <BranchBeams
              animate={!props.reducedMotion}
              beams={beamsOf(sceneAgents, layout, exploded, props.branchOf)}
            />
          )}
          {spire && (
            <Beanstalk
              stalk={spire}
              animate={animate}
              low={props.quality === 'low'}
              onHover={showStalkTip}
            />
          )}
          <Beacons
            animate={!props.reducedMotion}
            items={beaconsOf(sceneAgents, layout, exploded)}
          />
          {feeds.length > 0 && (
            <MultiCam feeds={feeds} seats={nav.seats} exploded={exploded} wall={wall} />
          )}
          <AnimationClock
            active={active || nav.directed !== null}
            smooth={nav.directed !== null}
            slow={compact}
          />
        </Canvas>
        {feeds.length > 0 && (
          <PipWall
            feeds={feeds}
            agents={props.agents}
            doing={props.doing}
            intensity={props.intensity}
            zh={zh}
            onSelect={props.onSelect}
            onClose={() => setPipsHidden(true)}
          />
        )}
        <div className="world-labels">
          {stalk && <StalkTooltip show={stalkTip} strands={stalk.strands} locale={props.locale} />}
          {sceneAgents.filter(named).map((agent) => (
            <button
              key={agent.id}
              ref={(node) => {
                if (node) elements.current.set(agent.id, node);
                else elements.current.delete(agent.id);
              }}
              className={`scene-label ${agent.id === props.selectedId ? 'selected' : ''} ${agent.id === hovered ? 'hovered' : ''} ${props.unreadIds?.has(agent.id) ? 'unread' : ''}`}
              onPointerDown={nav.userCamera} // a moving camera would slide the tag out from under the finger
              onClick={() => props.onSelect(agent.id)}
              onPointerEnter={() => hoverStart(agent.id)}
              onPointerLeave={() => hoverEnd(agent.id)}
            >
              <span style={{ background: agent.color }} />
              {agent.name}
              {(agent.id === hovered || onShot(agent.id)) && (
                <small>{props.doing?.[agent.id] ?? (compact ? null : agent.role)}</small>
              )}
            </button>
          ))}
          {(!compact || namesOn) &&
            !exploded &&
            floorZones(floor)
              .filter((z) => z.id !== 'atrium')
              .map((zone) => (
                <button
                  className="zone-label"
                  key={zone.id}
                  tabIndex={-1}
                  ref={(node) => {
                    if (node) elements.current.set(zone.id, node);
                    else elements.current.delete(zone.id);
                  }}
                  onClick={() => nav.fly([zone.x, floorY(floor, exploded), zone.z], ZONE_OFFSET)}
                >
                  {zh ? zone.zh : zone.en}
                </button>
              ))}
        </div>
        <SpeechLayer
          items={speakers.map((a) => ({ id: a.id, speech: props.speech![a.id]! }))}
          elements={speechElements.current}
          animate={!props.reducedMotion}
          tags={zh ? { user: '提示', assistant: '回覆' } : { user: 'Prompt', assistant: 'Reply' }}
        />
        {nav.directed?.entry === 'cut' && (
          <div className="cut-dip" key={nav.directed.startedAt} aria-hidden="true" />
        )}
        {nav.directed && (
          <ShotCaption
            zh={zh}
            shot={nav.directed.shot}
            agents={props.agents}
            doing={props.doing}
            attention={props.attention}
          />
        )}
        {compact ? (
          <CompactHud
            zh={zh}
            floor={floor}
            exploded={exploded}
            follow={auto}
            labels={namesOn}
            perFloor={nav.perFloor}
            onFloor={(next) => nav.showFloor(next)}
            onExplode={nav.toggleExploded}
            onFollow={nav.toggleFollow}
            onLabels={() => setNamesOn((v) => !v)}
          />
        ) : (
          <>
            <FloorHud zh={zh} exploded={exploded} floor={floor} perFloor={nav.perFloor} />
            <BuildingPanel
              zh={zh}
              floor={floor}
              exploded={exploded}
              follow={auto}
              perFloor={nav.perFloor}
              onFloor={nav.showFloor}
              onExplode={nav.toggleExploded}
              onFollow={nav.toggleFollow}
            />
          </>
        )}
      </div>
    </SceneBoundary>
  );
}
