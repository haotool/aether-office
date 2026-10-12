import { useMemo, useRef, type ReactNode } from 'react';
import { useFrame } from '@react-three/fiber';
import { Vector3, type Group } from 'three';
import { driftParams, leanAt, yawAt } from '../environment/behavior.js';
import type { Seat } from '../environment/director.js';
import { engagement, nodPitch, turnToward, type Engagement } from '../environment/interplay.js';
import { animationInterval } from '../perf/perf-control.js';
import { turnWeight } from '../core/pose-cues.js';
import type { TurnCue } from '../core/use-pose-cues.js';

const FOLLOW = 7;
const DIP = 0.15;
const SWAY_YIELD = 0.25;

type PoserProps = {
  seat: Seat;
  seed: string;
  engagements: readonly Engagement[] | undefined;
  turn?: TurnCue | undefined;
  reducedMotion: boolean;
  children: ReactNode;
};

type Gaze = { wanted: number; pitch: number };

function gazeOf(
  { seat, engagements, turn: asked, reducedMotion }: PoserProps,
  now: number,
  out: Gaze,
): Gaze {
  const latest = reducedMotion ? undefined : engagements?.[0];
  const age = latest ? now - latest.at : Infinity;
  const posed = asked && !reducedMotion ? asked.yaw * turnWeight(now - asked.at, asked.holdMs) : 0;
  out.wanted = latest ? turnToward(seat, latest.partner) * engagement(age) : posed;
  out.pitch = latest?.receives ? nodPitch(age) : 0;
  return out;
}

export function Poser(props: PoserProps) {
  const { seed, reducedMotion, children } = props;
  const group = useRef<Group>(null);
  const gaze = useRef<Gaze>({ wanted: 0, pitch: 0 });
  const turn = useRef(0);
  const owed = useRef(0);
  const here = useRef(new Vector3());
  const drift = useMemo(() => driftParams(seed), [seed]);
  useFrame(({ invalidate, clock, camera }, delta) => {
    const target = group.current;
    if (!target) return;
    const { wanted, pitch } = gazeOf(props, Date.now(), gaze.current);
    const calm = wanted === 0 && turn.current === 0 && pitch === 0;
    if (calm && reducedMotion) return;
    owed.current += Math.min(delta, 0.05);
    if (
      calm &&
      owed.current <
        animationInterval(camera.position.distanceTo(target.getWorldPosition(here.current)))
    )
      return;
    const step = owed.current;
    owed.current = 0;
    turn.current += (wanted - turn.current) * Math.min(1, step * FOLLOW);
    if (Math.abs(turn.current) < 0.0005 && wanted === 0) turn.current = 0;
    const sway = reducedMotion ? 0 : 1 - Math.min(1, Math.abs(turn.current) / SWAY_YIELD);
    const t = clock.elapsedTime;
    target.rotation.y = turn.current + yawAt(drift, t) * sway;
    target.rotation.x = pitch + leanAt(drift, t) * sway;
    target.position.y = -pitch * DIP;
    if (!calm) invalidate();
  });
  return <group ref={group}>{children}</group>;
}
