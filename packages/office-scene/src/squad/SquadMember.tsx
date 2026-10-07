import { useEffect, useMemo, useRef, useState, type ReactNode } from 'react';
import { useFrame, useThree } from '@react-three/fiber';
import type { Group } from 'three';
import type { Agent } from '@aether/contracts';
import { Animal, type EmoteCue, type Ring } from '../Animal.js';
import { Departing } from '../Departing.js';
import { WALK_PACE, WALK_STRIDE_SPEED } from '../departure.js';
import { createLongPress } from '../long-press.js';
import { Poser } from '../Poser.js';
import type { Engagement } from '../interplay.js';
import { AGENT_OFFSET } from '../scene-geometry.js';
import type { Quality } from '../scene-types.js';
import { Handing, type HandoverPlan } from './handover/index.js';
import { arrivalAt, type Arrival, type ErrandPose, type Leave } from './errand.js';
import type { SquadMemberState } from './squad-model.js';
import type { PodSeat } from './squad-seats.js';
import type { Point2 } from './squad-glide.js';

/** What a click, a hover or a press on a subagent does: the same as on any member (the page decides). */
export type MemberActions = {
  onActivate: (id: string, shift: boolean) => void;
  onMenu: (id: string) => void;
  onSelect: (id: string) => void;
  onFly: (target: [number, number, number], offset: [number, number, number]) => void;
  onHoverStart: (id: string) => void;
  onHoverEnd: (id: string) => void;
};

/** The agent a subagent is drawn as: it types while it works, waits when it asks a person, and rests when it is quiet. */
export const asSquadAgent = (agent: Agent, member: SquadMemberState): Agent => ({
  ...agent,
  activity: member.waiting ? 'waiting_permission' : member.working ? 'working' : 'idle',
});

/**
 * Moves its children along an arrival (see errand.ts): out of the core, to the pod, a turn to face the supervisor. The
 * children are told which clip to hold and, once there, to sit down. With no plan the member is simply seated.
 */
function Arriving({
  plan,
  startAt,
  reducedMotion,
  children,
}: {
  plan: Arrival | undefined;
  startAt: number;
  reducedMotion: boolean;
  children: (clip: ErrandPose['clip'], sit: EmoteCue | undefined) => ReactNode;
}) {
  const invalidate = useThree((s) => s.invalidate);
  const body = useRef<Group>(null);
  const [state, setState] = useState<{ clip: ErrandPose['clip']; done: boolean }>(() => {
    const first = plan && !reducedMotion ? arrivalAt(plan, Date.now() - startAt) : null;
    return { clip: first?.clip ?? null, done: !first || first.done };
  });
  useEffect(() => invalidate(), [invalidate]);
  useFrame(() => {
    if (!plan || state.done) return;
    const pose = arrivalAt(plan, Date.now() - startAt);
    body.current?.position.set(pose.x, 0, pose.z);
    if (body.current) {
      body.current.rotation.y = pose.yaw;
      body.current.scale.setScalar(Math.max(pose.scale, 0.001));
      body.current.visible = !pose.hidden;
    }
    setState((s) =>
      s.clip === pose.clip && s.done === pose.done ? s : { clip: pose.clip, done: pose.done },
    );
    if (!pose.done) invalidate();
  });
  const sits = !!plan && plan.mode === 'walk' && state.done && !reducedMotion;
  return (
    <group ref={body}>
      {children(state.done ? null : state.clip, sits ? { clip: 'sit_down', key: 1 } : undefined)}
    </group>
  );
}

/**
 * One subagent: seated in its pod (Animal under a Poser, as a member at a desk), walking in from the core, or on its
 * way out through it. Sits in its own group at the pod, turned like a desk, so a seat faces its supervisor.
 */
export function SquadMember({
  agent,
  member,
  seat,
  arrival,
  leave,
  handover,
  baseY,
  podPos,
  engagements,
  ring,
  selected,
  emote,
  reducedMotion,
  quality,
  light,
  actions,
  onFailure,
}: {
  agent: Agent;
  member: SquadMemberState;
  /** Its pod seat; a member that is leaving has only its plan. */
  seat: PodSeat | undefined;
  arrival: Arrival | undefined;
  leave: Leave | undefined;
  /** Its way out by the supervisor's desk, with its result (instead of `leave`). */
  handover: HandoverPlan | undefined;
  baseY: number;
  /** Where each sitter's pod is shown this frame (the zone glides as it grows). */
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
}) {
  const frame = useRef<Group>(null);
  const press = useMemo(() => createLongPress(() => actions.onMenu(agent.id)), [actions, agent.id]);
  const drawn = useMemo(() => asSquadAgent(agent, member), [agent, member]);
  const animal = {
    agent: drawn,
    selected,
    ring,
    reducedMotion,
    quality,
    light,
    onError: onFailure,
  };
  const origin =
    leave?.origin ??
    handover?.origin ??
    arrival?.origin ??
    (seat ? { x: seat.x, z: seat.z } : null);
  useFrame(() => {
    // A seated member follows its pod as the zone grows; one on a walk keeps to its plan's own chair.
    const at = !leave && !arrival ? podPos.get(member.id) : undefined;
    if (at) frame.current?.position.set(at.x, baseY, at.z);
  });
  if (!origin) return null;
  const yaw =
    leave?.frameYaw ??
    handover?.frameYaw ??
    arrival?.frameYaw ??
    ((seat?.rotation ?? 0) * Math.PI) / 2;
  if (handover)
    return (
      <group position={[origin.x, baseY, origin.z]} rotation={[0, yaw, 0]}>
        <Handing plan={handover} startAt={member.since}>
          {(clip, pace) => (
            <Animal {...animal} override={clip ?? undefined} pace={clip === 'walk' ? pace : 1} />
          )}
        </Handing>
      </group>
    );
  if (leave)
    return (
      <group position={[origin.x, baseY, origin.z]} rotation={[0, yaw, 0]}>
        <Departing
          plan={leave.plan}
          startAt={member.since}
          reducedMotion={reducedMotion}
          bag={false}
          bagColor={agent.color}
        >
          {(clip) => (
            <Animal
              {...animal}
              override={clip ?? undefined}
              pace={clip === 'walk' ? WALK_PACE : 1}
            />
          )}
        </Departing>
      </group>
    );
  return (
    <group
      ref={frame}
      position={[origin.x, baseY, origin.z]}
      rotation={[0, yaw, 0]}
      onClick={(e) => {
        e.stopPropagation();
        if (e.delta > 4 || press.consumeClick()) return;
        actions.onActivate(agent.id, e.shiftKey);
      }}
      onContextMenu={(e) => {
        e.stopPropagation();
        e.nativeEvent.preventDefault();
        actions.onMenu(agent.id);
      }}
      onPointerDown={(e) => {
        if (e.pointerType === 'touch') press.start(e.clientX, e.clientY);
      }}
      onPointerMove={(e) => press.move(e.clientX, e.clientY)}
      onPointerUp={press.end}
      onPointerCancel={press.end}
      onDoubleClick={(e) => {
        e.stopPropagation();
        actions.onSelect(agent.id);
        actions.onFly([origin.x, baseY + 0.7, origin.z], AGENT_OFFSET);
      }}
      onPointerOver={(e) => {
        e.stopPropagation();
        actions.onHoverStart(agent.id);
        document.body.style.cursor = 'pointer';
      }}
      onPointerOut={() => {
        actions.onHoverEnd(agent.id);
        document.body.style.cursor = '';
      }}
    >
      <Arriving plan={arrival} startAt={member.since} reducedMotion={reducedMotion}>
        {(clip, sit) => (
          <Poser
            seat={{
              x: seat?.deskX ?? origin.x,
              z: seat?.deskZ ?? origin.z,
              floor: seat?.floor ?? 0,
              rotation: seat?.rotation ?? 0,
            }}
            seed={agent.id}
            engagements={engagements}
            reducedMotion={reducedMotion}
          >
            <Animal
              {...animal}
              override={clip ?? undefined}
              emote={sit ?? emote}
              pace={
                clip === 'walk'
                  ? (arrival?.speed ?? 0) / WALK_STRIDE_SPEED
                  : member.working
                    ? 1.4
                    : 1
              }
            />
          </Poser>
        )}
      </Arriving>
    </group>
  );
}
