import type { OfficeSceneProps } from './scene-props.js';
import { SceneLights } from './SceneLights.js';
import { pickSpeakers } from './speakers.js';
import { MultiCam } from './MultiCam.js';
import { PipWall } from './PipWall.js';
import type { Rect } from './multi-view.js';
import { useCallback, useMemo, useRef, useState } from 'react';
import { Canvas } from '@react-three/fiber';
import type { Agent } from '@aether/contracts';
import { DEPARTMENTS } from '@aether/kernel';
import { FLOORS, defaultLayout, floorZones } from './layout.js';
import { Beanstalk, type StalkHover } from './Beanstalk.js';
import { layoutStalk, spreadStalk } from './stalk-layout.js';
import { EXPLODED_GAP, FLOOR_HEIGHT } from './building.js';
import { BranchBeams } from './BranchBeams.js';
import { planDepartures } from './departure.js';
import { CommLinks } from './CommLinks.js';
import { sceneRelations } from './interplay.js';
import { RelationLines } from './RelationLines.js';
import { DustMotes, LightShafts } from './Atmosphere.js';
import { Floor } from './Floor.js';
import { InteractionLayer, roleLabel } from './InteractionLayer.js';
import { InteractionProjections } from './InteractionProjections.js';
import {
  useSceneInteraction,
  type CharacterMenuContext,
  type GroupBarContext,
  type SceneActions,
} from './use-scene-interaction.js';
import { Beacons, ProjectedLabels } from './Labels.js';
import { compactionLabel } from './context.js';
import { Member } from './Member.js';
import { NameTag, tipOf } from './NameTag.js';
import { ProjectedSpeech, SpeechLayer } from './Speech.js';
import { MessageCarriers } from './MessageCarriers.js';
import { PerfProbe } from './PerfProbe.js';
import { AdaptiveRatio, ShadowThrottle, Warmup } from './PerfControllers.js';
import { PIXEL_RATIO_FLOOR, SHADOW_INTERVAL_MS } from './perf-control.js';
import { usePoseCues } from './use-pose-cues.js';
import { SceneCamera } from './SceneCamera.js';
import { StalkTooltip } from './StalkTooltip.js';
import { CompactHud } from './CompactHud.js';
import { BuildingPanel, FloorHud, ShotCaption } from './SceneHud.js';
import { FloorPlaque } from './FloorKpi.js';
import { AnimationClock, Runtime, SceneBoundary } from './SceneRuntime.js';
import { ACTIVE, OVERVIEW, ZONE_OFFSET, floorOfDesk, floorY } from './scene-geometry.js';
import { beaconsOf, beamsOf, labelsOf } from './scene-markers.js';
import { useSceneNavigation } from './scene-navigation.js';
import { IntroCaption, IntroDip, useIntroTour } from './intro/index.js';
import { LifeLayer, useAriaLog } from './life/index.js';
import { SquadDom, SquadLayer, SquadWarm, isPodSeat, useSquad } from './squad/index.js';

export type { OfficeSceneProps } from './scene-props.js';
export type { CharacterMenuContext, GroupBarContext, SceneActions };

export function OfficeScene(props: OfficeSceneProps) {
  const placed = useMemo(
    () => props.layout ?? defaultLayout(props.agents),
    [props.layout, props.agents],
  );
  // Subagents sit in their supervisor's squad zone: every seat lookup below reads the layout with their pod seats in it.
  const zh = props.locale === 'zh-TW';
  const ariaLog = useAriaLog(zh); // one log for the whole office: the life effects and the squads speak through it
  const pose = usePoseCues(props.reducedMotion); // the emotes, the hand-over's nods and the life effects' gestures
  const squad = useSquad(placed, props, ariaLog.say, pose.request);
  const layout = squad.layout;
  const elements = useRef(new Map<string, HTMLElement>());
  const speechElements = useRef(new Map<string, HTMLElement>());
  const chipElements = useRef(new Map<string, HTMLElement>());
  const [hovered, setHovered] = useState<string | null>(null);
  const compact = props.compact ?? false;
  // Names over the scene hide what is behind them: on a phone only the member in hand has one, until asked for all.
  const [namesOn, setNamesOn] = useState(!compact);
  const hoverStart = (id: string) => setHovered(id);
  const hoverEnd = (id: string) => setHovered((h) => (h === id ? null : h));
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
    intro,
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
  // Where the speech bubbles are drawn this frame: a name tag under one is hidden, not drawn over what the member said.
  const bubbles = useRef(new Map<string, Rect>());
  const auto = (props.autoCamera ?? true) && !props.reducedMotion;
  const onShot = (id: string) => nav.directed?.shot.subjects.includes(id) ?? false;
  const named = (agent: Agent) =>
    namesOn ||
    agent.id === props.selectedId ||
    agent.id === hovered ||
    agent.id === marks.menuId ||
    marks.group.has(agent.id) ||
    (!compact && onShot(agent.id)); // on a phone the caption names who the camera is on

  const visibleFloors = exploded
    ? Array.from({ length: FLOORS }, (_, i) => i)
    : Array.from({ length: floor + 1 }, (_, i) => i);
  const sceneAgents = props.agents.filter(
    (agent) => exploded || floorOfDesk(layout, agent.id) === floor,
  );
  // Who is turned toward whom (a message in the air), and the faint lines between desks of one repository or session.
  const { engagements, edges } = sceneRelations({
    pulses: props.pulses ?? [],
    seats: nav.seats,
    agents: sceneAgents,
    branchOf: props.branchOf,
    tethers: props.tethers ?? [],
    focus: hovered ?? props.selectedId,
    heightOf: (f) => floorY(f, exploded),
    visible: (f) => exploded || f === floor,
  });

  const ix = useSceneInteraction({
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
  const { marks, wall, seatDrag, words } = ix;
  const roleName = (agent: Agent) => roleLabel(props.roleOf?.(agent) ?? 'generalist', zh);

  const speakers = pickSpeakers({
    agents: sceneAgents,
    speech: props.speech,
    intensity: props.intensity,
    selectedId: props.selectedId,
    onShot,
    compact,
  });

  // The compaction chip: only while the page says the compaction is happening, and not at all on low quality.
  const chipped =
    props.quality === 'low' ? [] : sceneAgents.filter((a) => props.compactions?.[a.id]);

  // The most the scene may render at, by quality; AdaptiveRatio lowers it (to 0.75 at the least) while frames run slow.
  const maxRatio =
    props.quality === 'high' ? (compact ? 1.5 : 2) : props.quality === 'balanced' ? 1.5 : 1;
  const shadowsOn = !compact && props.quality !== 'low';
  const animate = !props.reducedMotion && props.quality !== 'low';
  const active =
    animate || (props.agents.some((a) => ACTIVE.includes(a.activity)) && !props.reducedMotion);
  const y = floorY(floor, exploded);
  const floorLayout = useMemo(
    () => ({ ...layout, objects: layout.objects.filter((o) => (o.floor ?? 0) === floor) }),
    [layout, floor],
  );
  const department = DEPARTMENTS[floor]!;
  const filming = nav.directed !== null || intro.active; // the camera runs itself: full-rate frames
  const squadScene = {
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
    elements: elements.current,
  };

  return (
    <SceneBoundary onFailure={props.onFailure}>
      <div
        className="canvas-container"
        data-following={nav.following ?? undefined}
        ref={wall.container}
      >
        <Canvas
          shadows={shadowsOn && 'percentage'} // three has dropped the soft map: "true" would log a warning each load
          camera={{ position: OVERVIEW(false), fov: 38, near: 0.4, far: 2400 }}
          frameloop={warm && !props.paused ? 'demand' : 'never'}
          dpr={[PIXEL_RATIO_FLOOR, maxRatio]}
          gl={{
            antialias: !compact && props.quality !== 'low',
            powerPreference: 'high-performance',
            alpha: false,
          }}
        >
          <SceneLights y={y} accent={department.accent} compact={compact} quality={props.quality} />
          {!exploded && !compact && props.quality !== 'low' && (
            <group position={[0, y, 0]}>
              <DustMotes quality={props.quality} animate={animate} />
              <LightShafts quality={props.quality} animate={animate} />
            </group>
          )}
          {visibleFloors.map((index) => (
            <Floor
              key={index}
              layout={placed}
              floor={index}
              y={floorY(index, exploded)}
              animate={animate && (exploded || index === floor)}
              detail={props.quality === 'high'}
            />
          ))}
          {sceneAgents.map((agent) => {
            const desk = layout.objects.find((o) => o.agentId === agent.id);
            if (!desk || isPodSeat(desk)) return null;
            return (
              <Member
                key={agent.id}
                agent={agent}
                desk={desk}
                exploded={exploded}
                role={props.roleOf?.(agent) ?? 'generalist'}
                facts={props.screens?.[agent.id]}
                intensity={props.intensity?.[agent.id] ?? 0}
                compaction={props.compactions?.[agent.id]}
                apparition={props.apparitions?.[agent.id]}
                zombie={(props.zombies?.[agent.id] ?? 0) > 0}
                engagements={engagements.get(agent.id)}
                attention={!!props.attention?.[agent.id]}
                departure={
                  departures[agent.id] && props.leaving?.[agent.id] !== undefined
                    ? { plan: departures[agent.id]!, startAt: props.leaving[agent.id]! }
                    : undefined
                }
                selected={agent.id === props.selectedId}
                ring={
                  marks.group.has(agent.id)
                    ? 'group'
                    : agent.id === props.selectedId
                      ? 'selected'
                      : agent.id === hovered
                        ? 'hover'
                        : null
                }
                emote={pose.cues[agent.id]}
                turn={pose.turns[agent.id]}
                reducedMotion={props.reducedMotion}
                quality={props.quality}
                light={compact}
                onActivate={(id, shift) => {
                  if (!seatDrag.justEnded()) marks.activate(id, { shift, keyboard: false });
                }}
                onMenu={marks.openMenu}
                onGrab={seatDrag.grab}
                onSelect={props.onSelect}
                onFly={nav.fly}
                onHoverStart={hoverStart}
                onHoverEnd={hoverEnd}
                onFailure={props.onFailure}
              />
            );
          })}
          <SquadLayer squad={squad} scene={squadScene} />
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
            avoid={wall.wall}
            covered={bubbles}
          />
          <ProjectedLabels
            labels={labelsOf(chipped, layout, floor, exploded && !compact).map((l) => ({
              ...l,
              width: 130,
            }))}
            elements={chipElements.current}
            selected={null}
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
            followPoint={nav.followPoint}
            introPose={intro.pose}
          />
          <InteractionProjections ix={ix} exploded={exploded} />
          <CommLinks
            pulses={props.pulses ?? []}
            seats={nav.seats}
            heightOf={(f) => floorY(f, exploded)}
            visible={(f) => exploded || f <= floor}
          />
          <RelationLines edges={edges} animate={!props.reducedMotion} />
          <LifeLayer
            input={props.life}
            seats={nav.seats}
            floor={floor}
            exploded={exploded}
            quality={props.quality}
            reducedMotion={props.reducedMotion}
            zh={zh}
            say={ariaLog.say}
            pose={pose.request}
          />
          <Runtime onFailure={props.onFailure} />
          {props.squads !== undefined && <SquadWarm quality={props.quality} zh={zh} />}
          <Warmup onReady={ready} />
          <AdaptiveRatio ceiling={maxRatio} smooth={filming} />
          {shadowsOn && <ShadowThrottle intervalMs={SHADOW_INTERVAL_MS[props.quality]} />}
          {props.onPerfReport && (
            <PerfProbe
              quality={props.quality}
              onReport={props.onPerfReport}
              {...(props.perfFrames ? { frames: props.perfFrames } : {})}
            />
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
          {wall.feeds.length > 0 && (
            <MultiCam feeds={wall.feeds} seats={nav.seats} exploded={exploded} wall={wall.wall} />
          )}
          <AnimationClock active={active || filming} smooth={filming} slow={compact} />
        </Canvas>
        {!warm && (
          <div className="scene-warming" role="status">
            {zh ? '準備場景…' : 'Preparing the scene…'}
          </div>
        )}
        {wall.feeds.length > 0 && (
          <PipWall
            feeds={wall.feeds}
            pinned={marks.pinned}
            agents={props.agents}
            doing={props.doing}
            intensity={props.intensity}
            zh={zh}
            onSelect={props.onSelect}
            onClose={ix.closeWall}
          />
        )}
        <div className="world-labels">
          {stalk && <StalkTooltip show={stalkTip} strands={stalk.strands} locale={props.locale} />}
          {sceneAgents.filter(named).map((agent) => (
            <NameTag
              key={agent.id}
              agent={agent}
              provider={props.screens?.[agent.id]?.provider}
              context={props.screens?.[agent.id]?.contextPercent ?? null}
              selected={agent.id === props.selectedId}
              hovered={agent.id === hovered}
              grouped={marks.group.has(agent.id)}
              menuOpen={agent.id === marks.menuId}
              label={`${props.names?.[agent.id]?.title ?? agent.name}, ${roleName(agent)}, ${words.state[agent.activity]}`}
              tip={tipOf(agent, props.names?.[agent.id])}
              accent={DEPARTMENTS[floorOfDesk(layout, agent.id)]?.accent ?? DEPARTMENTS[0]!.accent}
              still={!!props.reducedMotion}
              unread={props.unreadIds?.has(agent.id) ?? false}
              meta={
                agent.id === hovered || agent.id === props.selectedId || onShot(agent.id)
                  ? [
                      props.names?.[agent.id]?.repo,
                      roleName(agent),
                      props.doing?.[agent.id],
                    ].filter((part): part is string => !!part)
                  : null
              }
              setElement={(node) => {
                if (node) elements.current.set(agent.id, node);
                else elements.current.delete(agent.id);
              }}
              onPointerDown={nav.pause}
              onActivate={(how) => {
                if (!seatDrag.justEnded()) marks.activate(agent.id, how);
              }}
              onMenu={() => marks.openMenu(agent.id)}
              onGrab={(event) => seatDrag.grab(agent.id, event)}
              onHover={(on) => (on ? hoverStart(agent.id) : hoverEnd(agent.id))}
            />
          ))}
          {chipped.map((agent) => (
            <span
              key={`${agent.id}:${props.compactions![agent.id]!.key}`}
              ref={(node) => {
                if (node) chipElements.current.set(agent.id, node);
                else chipElements.current.delete(agent.id);
              }}
              className="compact-chip"
              role="status"
            >
              {compactionLabel(props.compactions![agent.id]!, zh)}
            </span>
          ))}
          <div ref={ariaLog.host} />
          <SquadDom squad={squad} scene={squadScene} />
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
        <InteractionLayer
          ix={ix}
          zh={zh}
          compact={compact}
          still={props.reducedMotion}
          characterMenu={props.characterMenu}
          groupBar={props.groupBar}
        />
        {props.overlay}
        <SpeechLayer
          items={speakers.map((a) => ({
            id: a.id,
            speech: props.speech![a.id]!,
            accent: DEPARTMENTS[floorOfDesk(layout, a.id)]?.accent ?? DEPARTMENTS[0]!.accent,
          }))}
          elements={speechElements.current}
          animate={!props.reducedMotion}
          tags={zh ? { user: '提示', assistant: '回覆' } : { user: 'Prompt', assistant: 'Reply' }}
        />
        {intro.dip && <IntroDip id={intro.dip} />}
        {intro.caption && (
          <IntroCaption
            caption={intro.caption}
            facts={intro.facts}
            zh={zh}
            onSkip={intro.interrupt}
            onNever={intro.never}
          />
        )}
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
            onReplayIntro={intro.available ? intro.replay : undefined}
          />
        ) : (
          <>
            <FloorHud zh={zh} exploded={exploded} floor={floor} perFloor={nav.perFloor} />
            {!exploded && props.floorKpi?.[floor] && props.onOpenFloorKpi && (
              <FloorPlaque
                zh={zh}
                floor={floor}
                badge={props.floorKpi[floor]!}
                onOpen={props.onOpenFloorKpi}
              />
            )}
            <BuildingPanel
              zh={zh}
              floor={floor}
              exploded={exploded}
              follow={auto}
              perFloor={nav.perFloor}
              kpi={props.floorKpi}
              onFloor={nav.showFloor}
              onExplode={nav.toggleExploded}
              onFollow={nav.toggleFollow}
              onReplayIntro={intro.available ? intro.replay : undefined}
            />
          </>
        )}
      </div>
    </SceneBoundary>
  );
}
