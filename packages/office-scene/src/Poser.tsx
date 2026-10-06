import { useMemo, useRef, type ReactNode } from 'react';
import { useFrame } from '@react-three/fiber';
import { Vector3, type Group } from 'three';
import { driftParams, leanAt, yawAt } from './behavior.js';
import type { Seat } from './director.js';
import { engagement, nodPitch, turnToward, type Engagement } from './interplay.js';
import { animationInterval } from './perf-control.js';

/** How quickly a member's turn follows its target, per second (an exponential approach, so it never snaps). */
const FOLLOW = 7;
/** A nod is a bob of the whole upper body about the seat; this much of it also dips the seat. */
const DIP = 0.15;
/** A turn this big (radians) has taken over from the idle sway entirely. */
const SWAY_YIELD = 0.25;

/**
 * Turns a seated member toward the one it is talking with (while a message is current) and nods the receiver when the
 * envelope lands. A rigid turn of the character about its seat, limited to a glance (see interplay.ts); the animation
 * underneath keeps playing. Between messages the member sways a little in its chair (a slow turn of up to 10 degrees and
 * a slight lean, each member's own, see behavior.ts), at the rate its distance from the camera allows.
 */
export function Poser({
  seat,
  seed,
  engagements,
  reducedMotion,
  children,
}: {
  seat: Seat;
  /** The member's id: its sway is its own. */
  seed: string;
  engagements: readonly Engagement[] | undefined;
  reducedMotion: boolean;
  children: ReactNode;
}) {
  const group = useRef<Group>(null);
  const turn = useRef(0);
  const owed = useRef(0);
  const here = useRef(new Vector3());
  const drift = useMemo(() => driftParams(seed), [seed]);
  useFrame(({ invalidate, clock, camera }, delta) => {
    const target = group.current;
    if (!target) return;
    const latest = reducedMotion ? undefined : engagements?.[0];
    const age = latest ? Date.now() - latest.at : Infinity;
    const wanted = latest ? turnToward(seat, latest.partner) * engagement(age) : 0;
    const pitch = latest?.receives ? nodPitch(age) : 0;
    const calm = wanted === 0 && turn.current === 0 && pitch === 0;
    if (calm && reducedMotion) return;
    owed.current += Math.min(delta, 0.05);
    // A member at rest sways at its distance's rate; one turning to a neighbour moves every frame.
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
    if (!calm) invalidate(); // a quiet sway rides on the frames the ambient clock already asks for
  });
  return <group ref={group}>{children}</group>;
}
