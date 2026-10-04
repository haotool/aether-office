import { useMemo, useRef, useState } from 'react';
import { Canvas } from '@react-three/fiber';
import type { Agent, Layout } from '@aether/contracts';
import { DEPARTMENTS } from '@aether/kernel';
import { FLOORS, defaultLayout, floorZones } from './layout.js';
import { OrbitalBackdrop } from './OrbitalBackdrop.js';
import type { Apparition } from './animal-states.js';
import { BranchBeams } from './BranchBeams.js';
import { CommLinks } from './CommLinks.js';
import type { Pulse } from './director.js';
import { Floor } from './Floor.js';
import { Beacons, ProjectedLabels } from './Labels.js';
import { Member } from './Member.js';
import { MessageCarriers } from './MessageCarriers.js';
import { PerfProbe } from './PerfProbe.js';
import { SceneCamera } from './SceneCamera.js';
import { CompactHud } from './CompactHud.js';
import { BuildingPanel, FloorHud, ShotCaption } from './SceneHud.js';
import { AnimationClock, Runtime, SceneBoundary } from './SceneRuntime.js';
import { ACTIVE, OVERVIEW, ZONE_OFFSET, floorOfDesk, floorY } from './scene-geometry.js';
import { beaconsOf, beamsOf, labelsOf } from './scene-markers.js';
import { useSceneNavigation } from './scene-navigation.js';
import type { BranchInfo, Quality } from './scene-types.js';
import type { PerfReport } from './perf.js';
import type { SceneMessage } from './carriers.js';

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
  /** The Git branch an agent works on, drawn as a beam from its desk into the core (the default branch). */
  branchOf?: (agent: Agent) => BranchInfo | null;
  /** Members drawn as something else at their own seat: a sleeping rabbit, a ghost, a jiangshi (see animal-states). */
  apparitions?: Readonly<Record<string, Apparition>>;
  /** Members with zombie processes under them (id → how many): a jiangshi stands behind each one's chair as well. */
  zombies?: Readonly<Record<string, number>>;
  /** Agents with something new for the user (waiting for them, or finished): their labels are marked. */
  unreadIds?: ReadonlySet<string>;
  /** Messages and subagent work in the last half minute: drawn between the members and cut to by the camera. */
  pulses?: readonly Pulse[];
  /** Members that want a person (forgotten, ownerless, zombies under them), by id with the reason in a few words. */
  attention?: Readonly<Record<string, string>>;
  /** What each member is doing right now, in a word or two (a tool, a state), shown by the member on screen. */
  doing?: Readonly<Record<string, string>>;
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
    directing: (props.autoCamera ?? true) && !props.reducedMotion,
    resumeMs: compact ? 10_000 : 30_000,
    selectedId: props.selectedId,
  });
  const { floor, exploded } = nav;
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
      <div className="canvas-container">
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
                apparition={props.apparitions?.[agent.id]}
                zombie={(props.zombies?.[agent.id] ?? 0) > 0}
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
          <Beacons
            animate={!props.reducedMotion}
            items={beaconsOf(sceneAgents, layout, exploded)}
          />
          <AnimationClock
            active={active || nav.directed !== null}
            smooth={nav.directed !== null}
            slow={compact}
          />
        </Canvas>
        <div className="world-labels">
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
