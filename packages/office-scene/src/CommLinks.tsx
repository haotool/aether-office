import { useEffect, useMemo, useRef } from 'react';
import { useFrame } from '@react-three/fiber';
import {
  AdditiveBlending,
  DoubleSide,
  QuadraticBezierCurve3,
  TubeGeometry,
  Vector3,
  type Group,
  type Mesh,
} from 'three';
import { PULSE_WINDOW_MS, type Pulse, type PulseKind, type Seat } from './director.js';
import { ENVELOPE_MS, distanceFade, envelopeProgress } from './interplay.js';
import { toWorld, type V3 } from './shot-camera.js';
import { useByValue } from './use-by-value.js';

// What a request, a decision, a handoff looks like in the air between two members. Colours match the rest of the
// scene: cyan is flow, amber wants an answer, violet hands something over.
const COLOR: Record<PulseKind, string> = {
  inform: '#6aa8ff',
  request: '#ffc65c',
  decision: '#43e6df',
  handoff: '#a592ff',
  sub: '#8ea6b5',
};
const HEAD = 1.9; // links leave from just above a head

function Link({
  pulse,
  from,
  to,
  height,
}: {
  pulse: Pulse;
  from: V3;
  to: V3;
  height: { from: number; to: number };
}) {
  const start = useByValue(from); // the arrays are new on every render
  const end = useByValue(to);
  const curve = useMemo(() => {
    const a = new Vector3(start[0], height.from + HEAD, start[2]);
    const b = new Vector3(end[0], height.to + HEAD, end[2]);
    const lift = 1.1 + a.distanceTo(b) * 0.2;
    const mid = a.clone().add(b).multiplyScalar(0.5);
    mid.y = Math.max(a.y, b.y) + lift;
    return new QuadraticBezierCurve3(a, mid, b);
  }, [start, end, height.from, height.to]);
  const geometry = useMemo(() => new TubeGeometry(curve, 36, 0.05, 6, false), [curve]);
  useEffect(() => () => geometry.dispose(), [geometry]);
  const tube = useRef<Mesh>(null);
  const packets = useRef<(Mesh | null)[]>([]);
  const ping = useRef<Mesh>(null);
  const envelope = useRef<Group>(null);
  const aim = useMemo(() => new Vector3(), []);
  const middle = useMemo(() => curve.getPoint(0.5), [curve]);
  const hands = pulse.kind !== 'sub'; // a message is handed over in an envelope; subagent work is a stream of light
  const color = COLOR[pulse.kind];
  useFrame(({ invalidate, camera }) => {
    const age = Date.now() - pulse.at;
    const fade = distanceFade(camera.position.distanceTo(middle));
    // Full strength for most of the window, then a fade out over the last six seconds.
    const strength = Math.min(1, Math.max(0, (PULSE_WINDOW_MS - age) / 6000));
    const material = tube.current?.material as { opacity: number } | undefined;
    if (material) material.opacity = 0.55 * strength * fade;
    const t = age / 1000;
    packets.current.forEach((mesh, i) => {
      if (!mesh) return;
      mesh.position.copy(curve.getPoint((((t * 0.45 + i / 3) % 1) + 1) % 1));
      mesh.scale.setScalar(0.7 + 0.5 * Math.sin(t * 6 + i));
      mesh.visible = strength > 0.02 && fade > 0.02;
    });
    if (ping.current) {
      const phase = (t * 0.9) % 1; // a ring that spreads from the receiver, again and again
      ping.current.scale.setScalar(0.3 + phase * 1.6);
      (ping.current.material as { opacity: number }).opacity = (1 - phase) * 0.7 * strength * fade;
    }
    const post = envelope.current;
    if (post) {
      // It leaves the sender's head, arcs to the receiver's and shrinks away once it has landed.
      const progress = envelopeProgress(age);
      const landed = Math.max(0, 1 - (age - ENVELOPE_MS) / 500);
      post.visible = hands && age >= 0 && landed > 0 && fade > 0.02;
      post.position.copy(curve.getPoint(progress));
      post.lookAt(aim.copy(curve.getPoint(Math.min(1, progress + 0.03))));
      post.scale.setScalar(landed * (1 + 0.12 * Math.sin(age / 90)));
    }
    if (strength > 0) invalidate();
  });
  return (
    <group>
      <mesh ref={tube} geometry={geometry}>
        <meshBasicMaterial
          color={color}
          transparent
          opacity={0.55}
          blending={AdditiveBlending}
          depthWrite={false}
          toneMapped={false}
        />
      </mesh>
      <group ref={envelope} visible={false}>
        <mesh>
          <boxGeometry args={[0.36, 0.03, 0.24]} />
          <meshBasicMaterial color="#fff3cf" toneMapped={false} />
        </mesh>
        <mesh scale={2.2}>
          <boxGeometry args={[0.36, 0.03, 0.24]} />
          <meshBasicMaterial
            color={color}
            transparent
            opacity={0.35}
            blending={AdditiveBlending}
            depthWrite={false}
            toneMapped={false}
          />
        </mesh>
      </group>
      {(hands ? [] : [0, 1, 2]).map((i) => (
        <mesh
          key={i}
          ref={(node) => {
            packets.current[i] = node;
          }}
        >
          <sphereGeometry args={[0.13, 10, 8]} />
          <meshBasicMaterial color={color} toneMapped={false} />
        </mesh>
      ))}
      <mesh ref={ping} position={[to[0], height.to + 0.06, to[2]]} rotation={[-Math.PI / 2, 0, 0]}>
        <ringGeometry args={[0.7, 0.82, 40]} />
        <meshBasicMaterial
          color={color}
          transparent
          blending={AdditiveBlending}
          depthWrite={false}
          side={DoubleSide}
          toneMapped={false}
        />
      </mesh>
    </group>
  );
}

/**
 * Messages and subagent work, drawn in the air: an arc between the two members with light travelling along it from the
 * sender, and a ring spreading where it lands, for as long as the exchange is current. Decoration over durable state:
 * it proves nothing about delivery (the delivery states do).
 */
export function CommLinks({
  pulses,
  seats,
  heightOf,
  visible,
}: {
  pulses: readonly Pulse[];
  seats: ReadonlyMap<string, Seat>;
  /** World height of a floor's ground. */
  heightOf: (floor: number) => number;
  /** Whether a floor is drawn at all. */
  visible: (floor: number) => boolean;
}) {
  const now = Date.now();
  const live = pulses.filter((p) => now - p.at <= PULSE_WINDOW_MS && now - p.at >= -5000);
  return (
    <>
      {live.map((pulse) => {
        const a = seats.get(pulse.from);
        const b = seats.get(pulse.to);
        if (!a || !b || !visible(a.floor) || !visible(b.floor)) return null;
        // The member sits a little in front of its desk.
        const from = toWorld(a, [0, 0, 0.86], 0);
        const to = toWorld(b, [0, 0, 0.86], 0);
        return (
          <Link
            key={pulse.id}
            pulse={pulse}
            from={from}
            to={to}
            height={{ from: heightOf(a.floor), to: heightOf(b.floor) }}
          />
        );
      })}
    </>
  );
}
