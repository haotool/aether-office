import { useEffect, useMemo, useRef, type RefObject } from 'react';
import { useFrame } from '@react-three/fiber';
import {
  AdditiveBlending,
  Color,
  DataTexture,
  NearestFilter,
  QuadraticBezierCurve3,
  RepeatWrapping,
  TubeGeometry,
  Vector3,
  type Mesh,
  type MeshBasicMaterial,
} from 'three';
import { useByValue } from '../core/use-by-value.js';
import { mergeGeometries } from 'three/examples/jsm/utils/BufferGeometryUtils.js';
import { itemAt } from './checked.js';

const IDLE_TINT = new Color('#8196ab');
const IDLE_HZ = 0.3;
const DASHES = 14;

function dashTexture() {
  const texture = new DataTexture(
    Uint8Array.from({ length: 32 }, (_, i) => (i < 16 ? 255 : 0)),
    8,
    1,
  );
  texture.wrapS = RepeatWrapping;
  texture.repeat.set(DASHES, 1);
  texture.magFilter = texture.minFilter = NearestFilter;
  texture.needsUpdate = true;
  return texture;
}

type BeamProps = {
  from: [number, number, number];
  to: [number, number, number];
  color: string;
  flowing: boolean;
};

function useBeamCurve(beams: readonly BeamProps[], flowing: boolean) {
  const coordinates = useByValue(beams.flatMap(({ from, to }) => [...from, ...to]));
  const { curve, geometry } = useMemo(() => {
    const curves = beams.map(
      ({ from, to }) =>
        new QuadraticBezierCurve3(
          new Vector3(...from),
          new Vector3((from[0] + to[0]) / 2, Math.max(from[1], to[1]) + 2.2, (from[2] + to[2]) / 2),
          new Vector3(...to),
        ),
    );
    const parts = curves.map((c) => new TubeGeometry(c, 28, flowing ? 0.075 : 0.04, 6, false));
    const geometry = mergeGeometries(parts);
    for (const part of parts) part.dispose();
    if (!geometry) throw new Error('GEOMETRY_MERGE_FAILED');
    return { curve: itemAt(curves, 0), geometry };
  }, [coordinates, flowing]);
  useEffect(() => () => geometry.dispose(), [geometry]);
  return { curve, geometry };
}

function Packets({
  curve,
  color,
  meshes,
}: {
  curve: QuadraticBezierCurve3;
  color: string;
  meshes: RefObject<(Mesh | null)[]>;
}) {
  return [0, 1, 2].map((i) => (
    <mesh
      key={i}
      ref={(node) => {
        meshes.current[i] = node;
      }}
      position={curve.getPoint(i / 3)}
    >
      <sphereGeometry args={[0.11, 10, 8]} />
      <meshBasicMaterial color={color} toneMapped={false} />
    </mesh>
  ));
}

function BranchBeam({ beams, animate }: { beams: readonly BeamProps[]; animate: boolean }) {
  const { color, flowing } = itemAt(beams, 0);
  const { curve, geometry } = useBeamCurve(beams, flowing);
  const dashes = useMemo(() => (flowing ? null : dashTexture()), [flowing]);
  useEffect(() => () => dashes?.dispose(), [dashes]);
  const tint = useMemo(
    () => (flowing ? color : new Color(color).lerp(IDLE_TINT, 0.5)),
    [color, flowing],
  );
  const material = useRef<MeshBasicMaterial>(null);
  const packets = useRef<(Mesh | null)[]>([]);
  const clock = useRef(0);
  useFrame((_state, delta) => {
    if (!animate) return;
    clock.current += delta;
    if (!flowing) {
      if (material.current)
        material.current.opacity = 0.45 + 0.2 * Math.sin(2 * Math.PI * IDLE_HZ * clock.current);
      return;
    }
    packets.current.forEach((mesh, i) => {
      if (!mesh) return;
      curve.getPoint((clock.current * 0.35 + i / 3) % 1, mesh.position);
    });
  });
  return (
    <group>
      <mesh geometry={geometry}>
        <meshBasicMaterial
          key={flowing ? 'flow' : 'idle'} // a new material, since an alpha map changes the shader
          ref={material}
          color={tint}
          alphaMap={dashes}
          transparent
          opacity={flowing ? 0.9 : 0.5}
          blending={AdditiveBlending}
          depthWrite={false}
          toneMapped={false}
        />
      </mesh>
      {flowing && <Packets curve={curve} color={color} meshes={packets} />}
    </group>
  );
}

type Beam = BeamProps & { id: string };

export function BranchBeams({ beams, animate }: { beams: Beam[]; animate: boolean }) {
  const batches = new Map<string, Beam[]>();
  for (const beam of beams) {
    const key = beam.flowing ? `flow:${beam.id}` : `idle:${beam.color}`;
    const batch = batches.get(key) ?? [];
    batch.push(beam);
    batches.set(key, batch);
  }
  return (
    <>
      {[...batches].map(([key, batch]) => (
        <BranchBeam key={key} beams={batch} animate={animate} />
      ))}
    </>
  );
}
