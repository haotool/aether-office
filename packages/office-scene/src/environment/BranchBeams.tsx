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
  animate: boolean;
};

function useBeamCurve(from: BeamProps['from'], to: BeamProps['to'], flowing: boolean) {
  const start = useByValue(from);
  const end = useByValue(to);
  const curve = useMemo(
    () =>
      new QuadraticBezierCurve3(
        new Vector3(...start),
        new Vector3(
          (start[0] + end[0]) / 2,
          Math.max(start[1], end[1]) + 2.2,
          (start[2] + end[2]) / 2,
        ),
        new Vector3(...end),
      ),
    [start, end],
  );
  const geometry = useMemo(
    () => new TubeGeometry(curve, 28, flowing ? 0.075 : 0.04, 6, false),
    [curve, flowing],
  );
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

function BranchBeam({ from, to, color, flowing, animate }: BeamProps) {
  const { curve, geometry } = useBeamCurve(from, to, flowing);
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
      mesh.position.copy(curve.getPoint((clock.current * 0.35 + i / 3) % 1));
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

type Beam = Omit<BeamProps, 'animate'> & { id: string };

export function BranchBeams({ beams, animate }: { beams: Beam[]; animate: boolean }) {
  return (
    <>
      {beams.map((beam) => (
        <BranchBeam key={beam.id} {...beam} animate={animate} />
      ))}
    </>
  );
}
