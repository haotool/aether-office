import { useEffect, useMemo, useRef, type RefObject } from 'react';
import { useFrame } from '@react-three/fiber';
import {
  AdditiveBlending,
  DoubleSide,
  QuadraticBezierCurve3,
  TubeGeometry,
  Vector3,
  type Camera,
  type Group,
  type Mesh,
} from 'three';
import { PULSE_WINDOW_MS, type Pulse, type PulseKind, type Seat } from './director.js';
import { ENVELOPE_MS, distanceFade, envelopeProgress } from './interplay.js';
import { toWorld, type V3 } from '../core/shot-camera.js';
import { useByValue } from '../core/use-by-value.js';

const COLOR: Record<PulseKind, string> = {
  inform: '#6aa8ff',
  request: '#ffc65c',
  decision: '#43e6df',
  handoff: '#a592ff',
  sub: '#8ea6b5',
};
const HEAD = 1.9;

type LinkProps = {
  pulse: Pulse;
  from: V3;
  to: V3;
  height: { from: number; to: number };
};

function useLinkCurve(from: V3, to: V3, height: LinkProps['height']) {
  const start = useByValue(from);
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
  const middle = useMemo(() => curve.getPoint(0.5), [curve]);
  return { curve, geometry, middle };
}

type LinkRefs = {
  tube: RefObject<Mesh | null>;
  packets: RefObject<(Mesh | null)[]>;
  ping: RefObject<Mesh | null>;
  envelope: RefObject<Group | null>;
};

function stepLink(
  { tube, packets, ping, envelope }: LinkRefs,
  { pulse, curve, middle, aim, hands }: LinkShape,
  camera: Camera,
): number {
  const age = Date.now() - pulse.at;
  const fade = distanceFade(camera.position.distanceTo(middle));
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
    const phase = (t * 0.9) % 1;
    ping.current.scale.setScalar(0.3 + phase * 1.6);
    (ping.current.material as { opacity: number }).opacity = (1 - phase) * 0.7 * strength * fade;
  }
  const post = envelope.current;
  if (post) {
    const progress = envelopeProgress(age);
    const landed = Math.max(0, 1 - (age - ENVELOPE_MS) / 500);
    post.visible = hands && age >= 0 && landed > 0 && fade > 0.02;
    post.position.copy(curve.getPoint(progress));
    post.lookAt(aim.copy(curve.getPoint(Math.min(1, progress + 0.03))));
    post.scale.setScalar(landed * (1 + 0.12 * Math.sin(age / 90)));
  }
  return strength;
}

type LinkShape = {
  pulse: Pulse;
  curve: QuadraticBezierCurve3;
  middle: Vector3;
  aim: Vector3;
  hands: boolean;
};

function Envelope({ color, group }: { color: string; group: RefObject<Group | null> }) {
  return (
    <group ref={group} visible={false}>
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
  );
}

function PingRing({ ring, at, color }: { ring: RefObject<Mesh | null>; at: V3; color: string }) {
  return (
    <mesh ref={ring} position={at} rotation={[-Math.PI / 2, 0, 0]}>
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
  );
}

function Link({ pulse, from, to, height }: LinkProps) {
  const { curve, geometry, middle } = useLinkCurve(from, to, height);
  const refs: LinkRefs = {
    tube: useRef<Mesh>(null),
    packets: useRef<(Mesh | null)[]>([]),
    ping: useRef<Mesh>(null),
    envelope: useRef<Group>(null),
  };
  const aim = useMemo(() => new Vector3(), []);
  const hands = pulse.kind !== 'sub';
  const color = COLOR[pulse.kind];
  useFrame(({ invalidate, camera }) => {
    if (stepLink(refs, { pulse, curve, middle, aim, hands }, camera) > 0) invalidate();
  });
  return (
    <group>
      <mesh ref={refs.tube} geometry={geometry}>
        <meshBasicMaterial
          color={color}
          transparent
          opacity={0.55}
          blending={AdditiveBlending}
          depthWrite={false}
          toneMapped={false}
        />
      </mesh>
      <Envelope color={color} group={refs.envelope} />
      {(hands ? [] : [0, 1, 2]).map((i) => (
        <mesh
          key={i}
          ref={(node) => {
            refs.packets.current[i] = node;
          }}
        >
          <sphereGeometry args={[0.13, 10, 8]} />
          <meshBasicMaterial color={color} toneMapped={false} />
        </mesh>
      ))}
      <PingRing ring={refs.ping} at={[to[0], height.to + 0.06, to[2]]} color={color} />
    </group>
  );
}

export function CommLinks({
  pulses,
  seats,
  heightOf,
  visible,
}: {
  pulses: readonly Pulse[];
  seats: ReadonlyMap<string, Seat>;
  heightOf: (floor: number) => number;
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
