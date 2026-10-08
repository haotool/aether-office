import { useMemo, useRef } from 'react';
import type { Agent } from '@aether/contracts';
import { ringFor } from '../character-ring.js';
import { ProjectedLabels } from '../Labels.js';
import { floorY } from '../scene-geometry.js';
import { SquadBeam, beamTier } from './SquadBeam.js';
import { squadLabelsOf } from './SquadDom.js';
import { SquadMember, type MemberActions } from './SquadMember.js';
import { SquadZones } from './SquadZones.js';
import { SupervisorDesk } from './SupervisorDesk.js';
import { Handover } from './handover/index.js';
import { PuppetStrings, stringsEnabled } from './puppet/index.js';
import { CHARACTER_BUDGET, type DrawSquad } from './squad-draw.js';
import type { Point2 } from './squad-glide.js';
import type { SquadSceneContext } from './squad-scene.js';
import type { SquadFrame } from './use-squad.js';

/** What the person has turned off or down. `calm` and `relation` are the office-life settings (the Calm switch is built apart). */
export type SquadPrefs = {
  /** Calm mode: the beam and the zone keep still. */
  calm?: boolean;
  /** The relation effects (the zone's dressing and the beam) are on; default on. Seating itself never turns off. */
  relation?: boolean;
  /** The puppet strings are on (default on); they also need the relation effects. */
  strings?: boolean;
  /** The hand-over of a result is shown (default on); needs the relation effects. Not a setting: a switch to measure what it costs. */
  handover?: boolean;
};

/** What a click, a hover or a press on a subagent does: the same as on any member (the page decides). */
function useMemberActions({ props, fly, hover, ix }: SquadSceneContext): MemberActions {
  return useMemo(
    () => ({
      onActivate: (id, shift) => {
        if (!ix.seatDrag.justEnded()) ix.marks.activate(id, { shift, keyboard: false });
      },
      onMenu: ix.marks.openMenu,
      onSelect: props.onSelect,
      onFly: fly,
      onHoverStart: hover.start,
      onHoverEnd: hover.end,
    }),
    [ix, props.onSelect, fly, hover.start, hover.end],
  );
}

/** Every agent seen so far by id: a leaver is no longer listed, but its last look stays. */
function useKnownAgents(agents: readonly Agent[]): ReadonlyMap<string, Agent> {
  const known = useRef(new Map<string, Agent>());
  for (const agent of agents) known.current.set(agent.id, agent);
  return known.current;
}

type SquadEffectsProps = {
  squad: SquadFrame;
  scene: SquadSceneContext;
  squads: readonly DrawSquad[];
  podPos: Map<string, Point2>;
};

/** The squads in view: each zone with its pods, the supervisor's dressing, the hand-over, the strings, the beam and the zone labels. */
function SquadEffects({ squad, scene, squads, podPos }: SquadEffectsProps) {
  const { props, exploded, compact } = scene;
  const { quality, reducedMotion } = props;
  const prefs = props.squadPrefs;
  const relation = prefs?.relation !== false;
  const still = reducedMotion || !!prefs?.calm;
  return (
    <>
      <SquadZones
        squads={squads}
        frame={squad}
        exploded={exploded}
        animate={!reducedMotion}
        podPos={podPos}
      />
      {relation && <SupervisorDesk squads={squads} exploded={exploded} />}
      {relation && <Handover squads={squads} frame={squad} exploded={exploded} zh={scene.zh} />}
      {stringsEnabled(quality, prefs) && (
        <PuppetStrings
          squads={squads}
          frame={squad}
          exploded={exploded}
          simulate={!still}
          quality={quality}
          podPos={podPos}
        />
      )}
      {relation && (
        <SquadBeam
          squads={squads}
          frame={squad}
          exploded={exploded}
          animate={!still && quality !== 'low'}
          tier={beamTier(quality)}
        />
      )}
      {!compact && (
        <ProjectedLabels
          labels={squadLabelsOf(squads, exploded)}
          elements={scene.elements}
          selected={null}
        />
      )}
    </>
  );
}

type MembersProps = {
  squad: SquadFrame;
  scene: SquadSceneContext;
  known: ReadonlyMap<string, Agent>;
  podPos: Map<string, Point2>;
};

/** The subagents of the squads in view: seated, arriving or leaving, each at its own floor. */
function SquadMembers({ squad, scene, known, podPos }: MembersProps) {
  const { props, floor, exploded, compact, hover, ix, engagements, pose } = scene;
  const { quality, reducedMotion, selectedId } = props;
  const actions = useMemberActions(scene);
  const floorOfSquad = new Map(squad.squads.map((s) => [s.supervisor, s.floor]));
  const budget = CHARACTER_BUDGET[quality];
  return squad.members.map((m) => {
    const agent = known.get(m.id);
    const memberFloor = floorOfSquad.get(m.supervisor);
    if (!agent || memberFloor === undefined || (!exploded && memberFloor !== floor)) return null;
    if (m.phase !== 'leaving' && m.seat >= budget) return null; // a silhouette: drawn by the zone
    return (
      <SquadMember
        key={m.id}
        agent={agent}
        member={m}
        seat={squad.seats.find((s) => s.member === m.id)}
        arrival={squad.arrivals.get(m.id)}
        leave={squad.leaves.get(m.id)}
        handover={squad.handovers.get(m.id)}
        baseY={floorY(memberFloor, exploded)}
        podPos={podPos}
        engagements={engagements.get(m.id)}
        ring={ringFor(m.id, { group: ix.marks.group, selectedId, hoveredId: hover.id })}
        selected={m.id === selectedId}
        emote={pose.cues[m.id]}
        reducedMotion={reducedMotion}
        quality={quality}
        light={compact}
        actions={actions}
        onFailure={props.onFailure}
      />
    );
  });
}

/**
 * Everything drawn for the squads of the scene: each zone with its pods, the supervisor's dressing, the beam into the
 * core, the subagents (seated, arriving, leaving), the zone labels and the activity log. A sibling of the members,
 * mounted by the scene next to them; the subagents are seated in the frame's layout (see use-squad.ts).
 */
export function SquadLayer({ squad, scene }: { squad: SquadFrame; scene: SquadSceneContext }) {
  const { floor, exploded } = scene;
  const known = useKnownAgents(scene.props.agents);
  const podPos = useRef(new Map<string, Point2>());
  const all = squad.squads;
  const squads = useMemo(
    () => all.filter((s) => exploded || s.floor === floor),
    [all, exploded, floor],
  );
  squad.handover.view.current = { floor, exploded }; // a hand-over is walked only for a desk that is in view
  return (
    <>
      {squads.length > 0 && (
        <SquadEffects squad={squad} scene={scene} squads={squads} podPos={podPos.current} />
      )}
      <SquadMembers squad={squad} scene={scene} known={known} podPos={podPos.current} />
    </>
  );
}
