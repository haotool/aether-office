import { Canvas } from '@react-three/fiber';
import type { Agent } from '@aether/contracts';
import { ringFor } from './character-ring.js';
import type { SceneModel } from './use-scene-model.js';
import { SceneLights } from './SceneLights.js';
import { MultiCam } from './MultiCam.js';
import { Beanstalk } from './Beanstalk.js';
import { BranchBeams } from './BranchBeams.js';
import { CommLinks } from './CommLinks.js';
import { RelationLines } from './RelationLines.js';
import { DustMotes, LightShafts } from './Atmosphere.js';
import { Floor } from './Floor.js';
import { InteractionProjections } from './InteractionProjections.js';
import { Beacons, ProjectedLabels } from './Labels.js';
import { Member } from './Member.js';
import { ProjectedSpeech } from './Speech.js';
import { MessageCarriers } from './MessageCarriers.js';
import { PerfProbe } from './PerfProbe.js';
import { AdaptiveRatio, ShadowThrottle, Warmup } from './PerfControllers.js';
import { PIXEL_RATIO_FLOOR, SHADOW_INTERVAL_MS, antialiasFor } from './perf-control.js';
import { SceneCamera } from './SceneCamera.js';
import { AnimationClock, Runtime } from './SceneRuntime.js';
import { OVERVIEW, floorY } from './scene-geometry.js';
import { beaconsOf, beamsOf, labelsOf } from './scene-markers.js';
import { LifeLayer } from './life/index.js';
import { SquadLayer, SquadWarm, isPodSeat } from './squad/index.js';

/** One member at its desk (a squad's pod seats are drawn by the squad layer, not here). */
function memberAt(m: SceneModel, agent: Agent) {
  const { props, nav, pose } = m;
  const { marks, seatDrag } = m.ix;
  const desk = m.layout.objects.find((o) => o.agentId === agent.id);
  if (!desk || isPodSeat(desk)) return null;
  const plan = m.departures[agent.id];
  const startAt = props.leaving?.[agent.id];
  return (
    <Member
      key={agent.id}
      agent={agent}
      desk={desk}
      exploded={m.exploded}
      role={props.roleOf?.(agent) ?? 'generalist'}
      facts={props.screens?.[agent.id]}
      intensity={props.intensity?.[agent.id] ?? 0}
      compaction={props.compactions?.[agent.id]}
      apparition={props.apparitions?.[agent.id]}
      zombie={(props.zombies?.[agent.id] ?? 0) > 0}
      engagements={m.engagements.get(agent.id)}
      attention={!!props.attention?.[agent.id]}
      departure={plan && startAt !== undefined ? { plan, startAt } : undefined}
      selected={agent.id === props.selectedId}
      ring={ringFor(agent.id, {
        group: marks.group,
        selectedId: props.selectedId,
        hoveredId: m.hovered,
      })}
      emote={pose.cues[agent.id]}
      turn={pose.turns[agent.id]}
      reducedMotion={props.reducedMotion}
      quality={props.quality}
      light={m.compact}
      onActivate={(id, shift) => {
        if (!seatDrag.justEnded()) marks.activate(id, { shift, keyboard: false });
      }}
      onMenu={marks.openMenu}
      onGrab={seatDrag.grab}
      onSelect={props.onSelect}
      onFly={nav.fly}
      onHoverStart={m.hoverStart}
      onHoverEnd={m.hoverEnd}
      onFailure={props.onFailure}
    />
  );
}

/** The lights, the air above the floor in view, and every floor drawn. */
function SceneAmbience({ m }: { m: SceneModel }) {
  const { props, exploded, compact, floor, y, animate } = m;
  return (
    <>
      <SceneLights y={y} accent={m.department.accent} compact={compact} quality={props.quality} />
      {!exploded && !compact && props.quality !== 'low' && (
        <group position={[0, y, 0]}>
          <DustMotes quality={props.quality} animate={animate} />
          <LightShafts quality={props.quality} animate={animate} />
        </group>
      )}
      {m.visibleFloors.map((index) => (
        <Floor
          key={index}
          layout={m.placed}
          floor={index}
          y={floorY(index, exploded)}
          animate={animate && (exploded || index === floor)}
          detail={props.quality === 'high'}
        />
      ))}
    </>
  );
}

/** The labels drawn over the scene each frame from where things are: names, compaction chips, speech. */
function SceneProjections({ m }: { m: SceneModel }) {
  const { props, layout, floor, exploded, compact } = m;
  const spread = exploded && !compact;
  return (
    <>
      <ProjectedLabels
        labels={labelsOf(m.sceneAgents.filter(m.named), layout, floor, spread)}
        elements={m.elements.current}
        selected={props.selectedId}
        avoid={m.ix.wall.wall}
        covered={m.bubbles}
      />
      <ProjectedLabels
        labels={labelsOf(m.chipped, layout, floor, spread).map((l) => ({ ...l, width: 130 }))}
        elements={m.chipElements.current}
        selected={null}
      />
      <ProjectedSpeech
        anchors={labelsOf(m.speakers, layout, floor, spread)}
        elements={m.speechElements.current}
        drawn={m.bubbles}
      />
    </>
  );
}

/** What keeps the scene running: the context loss handler, the warm-up, the pixel ratio and shadow pacing, the probe. */
function SceneControllers({ m }: { m: SceneModel }) {
  const { props, shadowsOn } = m;
  return (
    <>
      <Runtime
        onLost={props.onContextLost ?? props.onFailure}
        onRestored={props.onContextRestored}
      />
      {props.squads !== undefined && <SquadWarm quality={props.quality} zh={m.zh} />}
      <Warmup onReady={m.ready} />
      <AdaptiveRatio ceiling={m.maxRatio} smooth={m.filming} compact={m.compact} />
      {shadowsOn && <ShadowThrottle intervalMs={SHADOW_INTERVAL_MS[props.quality]} />}
      {props.onPerfReport && (
        <PerfProbe
          quality={props.quality}
          onReport={props.onPerfReport}
          {...(props.perfFrames ? { frames: props.perfFrames } : {})}
        />
      )}
    </>
  );
}

/** Branch beams into the core, the commit spire, the beacons over members, and the wall's extra cameras. */
function SceneMarkers({ m }: { m: SceneModel }) {
  const { props, layout, exploded, sceneAgents, nav } = m;
  return (
    <>
      {props.branchOf && (
        <BranchBeams
          animate={!props.reducedMotion}
          beams={beamsOf(sceneAgents, layout, exploded, props.branchOf)}
        />
      )}
      {m.spire && (
        <Beanstalk
          stalk={m.spire}
          animate={m.animate}
          low={props.quality === 'low'}
          onHover={m.showTip}
        />
      )}
      <Beacons animate={!props.reducedMotion} items={beaconsOf(sceneAgents, layout, exploded)} />
      {m.ix.wall.feeds.length > 0 && (
        <MultiCam
          feeds={m.ix.wall.feeds}
          seats={nav.seats}
          exploded={exploded}
          wall={m.ix.wall.wall}
        />
      )}
    </>
  );
}

/** The 3D half of the scene: everything inside the canvas, in the order it is drawn. */
export function SceneCanvas({ m }: { m: SceneModel }) {
  const { props, nav, intro, floor, exploded, compact } = m;
  return (
    <Canvas
      shadows={m.shadowsOn && 'percentage'} // three has dropped the soft map: "true" would log a warning each load
      camera={{ position: OVERVIEW(false), fov: 38, near: 0.4, far: 2400 }}
      frameloop={m.warm && !props.paused ? 'demand' : 'never'}
      dpr={[PIXEL_RATIO_FLOOR, m.maxRatio]}
      gl={{
        antialias: antialiasFor(window.location.search, compact, props.quality),
        powerPreference: 'high-performance',
        alpha: false,
      }}
    >
      <SceneAmbience m={m} />
      {m.sceneAgents.map((agent) => memberAt(m, agent))}
      <SquadLayer squad={m.squad} scene={m.squadScene} />
      <group position={[0, m.y, 0]}>
        <MessageCarriers
          layout={m.floorLayout}
          messages={props.messages ?? []}
          reducedMotion={props.reducedMotion}
          onUnreachable={props.onMessageUnreachable}
        />
      </group>
      <SceneProjections m={m} />
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
      <InteractionProjections ix={m.ix} exploded={exploded} />
      <CommLinks
        pulses={props.pulses ?? []}
        seats={nav.seats}
        heightOf={(f) => floorY(f, exploded)}
        visible={(f) => exploded || f <= floor}
      />
      <RelationLines edges={m.edges} animate={!props.reducedMotion} />
      <LifeLayer
        input={props.life}
        seats={nav.seats}
        floor={floor}
        exploded={exploded}
        quality={props.quality}
        reducedMotion={props.reducedMotion}
        zh={m.zh}
        say={m.ariaLog.say}
        pose={m.pose.request}
      />
      <SceneControllers m={m} />
      <SceneMarkers m={m} />
      <AnimationClock active={m.active || m.filming} smooth={m.filming} slow={compact} />
    </Canvas>
  );
}
