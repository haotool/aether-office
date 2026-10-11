import { useMemo, useRef, type ComponentProps } from 'react';
import { useFrame } from '@react-three/fiber';
import type { Group } from 'three';
import type { Agent } from '@aether/contracts';
import { Animal, type EmoteCue, type Ring } from '../animals/Animal.js';
import { Departing } from '../components/Departing.js';
import { WALK_PACE, WALK_STRIDE_SPEED } from '../animals/departure.js';
import { characterEvents } from '../characters/character-events.js';
import { createLongPress } from '../core/long-press.js';
import { Poser } from '../components/Poser.js';
import type { Engagement } from '../environment/interplay.js';
import type { Quality } from '../scene/scene-types.js';
import { Handing, type HandoverPlan } from './handover/index.js';
import type { Arrival, Leave } from './errand.js';
import type { SquadMemberState } from './squad-model.js';
import type { PodSeat } from './squad-seats.js';
import type { Point2 } from './squad-glide.js';
import { Arriving } from './SquadArriving.js';

export type MemberActions = {
  onActivate: (id: string, shift: boolean) => void;
  onMenu: (id: string) => void;
  onSelect: (id: string) => void;
  onFly: (target: [number, number, number], offset: [number, number, number]) => void;
  onHoverStart: (id: string) => void;
  onHoverEnd: (id: string) => void;
};

const asSquadAgent = (agent: Agent, member: SquadMemberState): Agent => ({
  ...agent,
  activity: member.waiting ? 'waiting_permission' : member.working ? 'working' : 'idle',
});

type AnimalProps = Pick<
  ComponentProps<typeof Animal>,
  'agent' | 'selected' | 'ring' | 'reducedMotion' | 'quality' | 'light' | 'onError'
>;

type Origin = { x: number; z: number };

function HandingMember({
  plan,
  member,
  origin,
  baseY,
  yaw,
  animal,
}: {
  plan: HandoverPlan;
  member: SquadMemberState;
  origin: Origin;
  baseY: number;
  yaw: number;
  animal: AnimalProps;
}) {
  return (
    <group position={[origin.x, baseY, origin.z]} rotation={[0, yaw, 0]}>
      <Handing plan={plan} startAt={member.since}>
        {(clip, pace) => (
          <Animal {...animal} override={clip ?? undefined} pace={clip === 'walk' ? pace : 1} />
        )}
      </Handing>
    </group>
  );
}

function LeavingMember({
  leave,
  member,
  bagColor,
  origin,
  baseY,
  yaw,
  animal,
}: {
  leave: Leave;
  member: SquadMemberState;
  bagColor: string;
  origin: Origin;
  baseY: number;
  yaw: number;
  animal: AnimalProps;
}) {
  return (
    <group position={[origin.x, baseY, origin.z]} rotation={[0, yaw, 0]}>
      <Departing
        plan={leave.plan}
        startAt={member.since}
        reducedMotion={animal.reducedMotion}
        bag={false}
        bagColor={bagColor}
      >
        {(clip) => (
          <Animal {...animal} override={clip ?? undefined} pace={clip === 'walk' ? WALK_PACE : 1} />
        )}
      </Departing>
    </group>
  );
}

type SeatedMemberProps = {
  member: SquadMemberState;
  seat: PodSeat | undefined;
  arrival: Arrival | undefined;
  origin: Origin;
  baseY: number;
  yaw: number;
  podPos: ReadonlyMap<string, Point2>;
  engagements: readonly Engagement[] | undefined;
  emote: EmoteCue | undefined;
  actions: MemberActions;
  animal: AnimalProps;
};

const deskSeat = (seat: PodSeat | undefined, origin: Origin) => ({
  x: seat?.deskX ?? origin.x,
  z: seat?.deskZ ?? origin.z,
  floor: seat?.floor ?? 0,
  rotation: seat?.rotation ?? 0,
});

const paceOf = (clip: string | null, arrival: Arrival | undefined, member: SquadMemberState) =>
  clip === 'walk' ? (arrival?.speed ?? 0) / WALK_STRIDE_SPEED : member.working ? 1.4 : 1;

function SeatedMember({
  member,
  seat,
  arrival,
  origin,
  baseY,
  yaw,
  podPos,
  engagements,
  emote,
  actions,
  animal,
}: SeatedMemberProps) {
  const frame = useRef<Group>(null);
  const id = animal.agent.id;
  const press = useMemo(() => createLongPress(() => actions.onMenu(id)), [actions, id]);
  useFrame(() => {
    const at = !arrival ? podPos.get(member.id) : undefined;
    if (at) frame.current?.position.set(at.x, baseY, at.z);
  });
  return (
    <group
      ref={frame}
      position={[origin.x, baseY, origin.z]}
      rotation={[0, yaw, 0]}
      {...characterEvents(id, [origin.x, baseY + 0.7, origin.z], press, actions)}
    >
      <Arriving plan={arrival} startAt={member.since} reducedMotion={animal.reducedMotion}>
        {(clip, sit) => (
          <Poser
            seat={deskSeat(seat, origin)}
            seed={id}
            engagements={engagements}
            reducedMotion={animal.reducedMotion}
          >
            <Animal
              {...animal}
              override={clip ?? undefined}
              emote={sit ?? emote}
              pace={paceOf(clip, arrival, member)}
            />
          </Poser>
        )}
      </Arriving>
    </group>
  );
}

type SquadMemberProps = {
  agent: Agent;
  member: SquadMemberState;
  seat: PodSeat | undefined;
  arrival: Arrival | undefined;
  leave: Leave | undefined;
  handover: HandoverPlan | undefined;
  baseY: number;
  podPos: ReadonlyMap<string, Point2>;
  engagements: readonly Engagement[] | undefined;
  ring: Ring | null;
  selected: boolean;
  emote: EmoteCue | undefined;
  reducedMotion: boolean;
  quality: Quality;
  light: boolean;
  actions: MemberActions;
  onFailure: () => void;
};

function standingOf({
  leave,
  handover,
  arrival,
  seat,
}: Pick<SquadMemberProps, 'leave' | 'handover' | 'arrival' | 'seat'>) {
  const origin =
    leave?.origin ??
    handover?.origin ??
    arrival?.origin ??
    (seat ? { x: seat.x, z: seat.z } : null);
  const yaw =
    leave?.frameYaw ??
    handover?.frameYaw ??
    arrival?.frameYaw ??
    ((seat?.rotation ?? 0) * Math.PI) / 2;
  return origin ? { origin, yaw } : null;
}

export function SquadMember(props: SquadMemberProps) {
  const { agent, member, seat, arrival, leave, handover, baseY, podPos, engagements } = props;
  const { emote, actions } = props;
  const drawn = useMemo(() => asSquadAgent(agent, member), [agent, member]);
  const animal: AnimalProps = {
    agent: drawn,
    selected: props.selected,
    ring: props.ring,
    reducedMotion: props.reducedMotion,
    quality: props.quality,
    light: props.light,
    onError: props.onFailure,
  };
  const standing = standingOf(props);
  if (!standing) return null;
  const { origin, yaw } = standing;
  if (handover)
    return <HandingMember {...{ plan: handover, member, origin, baseY, yaw, animal }} />;
  if (leave)
    return (
      <LeavingMember {...{ leave, member, bagColor: agent.color, origin, baseY, yaw, animal }} />
    );
  return (
    <SeatedMember
      {...{
        member,
        seat,
        arrival,
        origin,
        baseY,
        yaw,
        podPos,
        engagements,
        emote,
        actions,
        animal,
      }}
    />
  );
}
