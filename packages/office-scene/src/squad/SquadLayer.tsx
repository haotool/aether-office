import { useMemo, useRef } from 'react';
import type { Agent } from '@aether/contracts';
import { ringFor } from '../characters/character-ring.js';
import { ProjectedLabels } from '../components/Labels.js';
import { floorY } from '../scene/scene-geometry.js';
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

export type SquadPrefs = {
  calm?: boolean;
  relation?: boolean;
  strings?: boolean;
  handover?: boolean;
};

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
    if (m.phase !== 'leaving' && m.seat >= budget) return null;
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

export function SquadLayer({ squad, scene }: { squad: SquadFrame; scene: SquadSceneContext }) {
  const { floor, exploded } = scene;
  const known = useKnownAgents(scene.props.agents);
  const podPos = useRef(new Map<string, Point2>());
  const all = squad.squads;
  const squads = useMemo(
    () => all.filter((s) => exploded || s.floor === floor),
    [all, exploded, floor],
  );
  squad.handover.view.current = { floor, exploded };
  return (
    <>
      {squads.length > 0 && (
        <SquadEffects squad={squad} scene={scene} squads={squads} podPos={podPos.current} />
      )}
      <SquadMembers squad={squad} scene={scene} known={known} podPos={podPos.current} />
    </>
  );
}
