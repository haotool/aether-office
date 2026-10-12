import { useEffect, useMemo, useRef, useState, type RefObject } from 'react';
import { useFrame } from '@react-three/fiber';
import {
  BufferAttribute,
  CanvasTexture,
  SRGBColorSpace,
  type Mesh,
  type Points,
  type PointsMaterial,
} from 'three';
import { COMPACTION_SECONDS, CONTEXT_COLOR, easeOut } from '../environment/context.js';
import { seeded } from '../environment/seeded.js';
import { context2d } from '../core/canvas-2d.js';

const PAPERS = 40;
const BURST_END = 0.8;
const GATHER_END = 1.5;
const CUBE_END = 2.3;
const RADIUS = 0.62;

function paperTexture(): CanvasTexture {
  const canvas = document.createElement('canvas');
  canvas.width = canvas.height = 64;
  const g = context2d(canvas);
  g.fillStyle = '#fff';
  g.fillRect(14, 6, 36, 52);
  g.fillStyle = 'rgba(0,0,0,0.35)';
  for (let i = 0; i < 5; i++) g.fillRect(19, 14 + i * 9, i % 2 ? 20 : 26, 3);
  const texture = new CanvasTexture(canvas);
  texture.colorSpace = SRGBColorSpace;
  return texture;
}

function PaperPoints(props: {
  points: RefObject<Points | null>;
  material: RefObject<PointsMaterial | null>;
  map: CanvasTexture;
  positions: Float32Array;
}) {
  return (
    <points ref={props.points} frustumCulled={false}>
      <bufferGeometry>
        <bufferAttribute attach="attributes-position" args={[props.positions, 3]} />
      </bufferGeometry>
      <pointsMaterial
        ref={props.material}
        map={props.map}
        size={0.3}
        color="#f4fbff"
        transparent
        depthWrite={false}
        toneMapped={false}
      />
    </points>
  );
}

function GlowRing({ ring }: { ring: RefObject<Mesh | null> }) {
  return (
    <mesh ref={ring} rotation={[-Math.PI / 2, 0, 0]}>
      <ringGeometry args={[0.45, 0.5, 48]} />
      <meshBasicMaterial
        color={CONTEXT_COLOR.calm}
        transparent
        opacity={0}
        depthWrite={false}
        toneMapped={false}
        side={2}
      />
    </mesh>
  );
}

type Sheet = { x: number; y: number; z: number; delay: number };
const clamp01 = (v: number) => Math.min(1, Math.max(0, v));

function flySheets(positions: Float32Array, sheets: readonly Sheet[], t: number) {
  const gather = clamp01((t - BURST_END) / (GATHER_END - BURST_END));
  const pull = gather * gather;
  sheets.forEach((s, i) => {
    const out = easeOut((t - s.delay) / (BURST_END - s.delay)) * RADIUS;
    const r = out * (1 - pull);
    positions[i * 3] = s.x * r;
    positions[i * 3 + 1] = s.y * r * 0.8 + 0.1 * Math.sin(t * 5 + i) * (1 - pull);
    positions[i * 3 + 2] = s.z * r;
  });
}

function dimPaper(material: PointsMaterial, t: number) {
  material.opacity = t < GATHER_END ? 0.95 : Math.max(0, 1 - (t - GATHER_END) * 6);
  material.size = 0.3 * (1 - 0.7 * clamp01((t - BURST_END) / 0.7));
}

function turnCube(cube: Mesh, t: number) {
  const grow = clamp01((t - (GATHER_END - 0.2)) / 0.25);
  const fade = clamp01((t - CUBE_END) / (COMPACTION_SECONDS - CUBE_END));
  const pop = easeOut(grow) * (1 + 0.25 * Math.sin(grow * Math.PI));
  cube.scale.setScalar(Math.max(0.0001, pop * (1 - fade) * 0.17));
  cube.rotation.set(t * 1.4, t * 2.1, 0);
}

function spreadRing(ring: Mesh, t: number) {
  const k = clamp01((t - GATHER_END) / 0.8);
  ring.scale.setScalar(0.1 + easeOut(k) * 1.9);
  (ring.material as { opacity: number }).opacity = k > 0 && k < 1 ? 0.7 * (1 - k) : 0;
}

export function CompactionEffect({ position }: { position: [number, number, number] }) {
  const points = useRef<Points>(null);
  const paperMaterial = useRef<PointsMaterial>(null);
  const cube = useRef<Mesh>(null);
  const ring = useRef<Mesh>(null);
  const start = useRef(-1);
  const [done, setDone] = useState(false);
  const paper = useMemo(paperTexture, []);
  useEffect(() => () => paper.dispose(), [paper]);
  const sheets = useMemo(() => {
    const random = seeded('compaction');
    return Array.from({ length: PAPERS }, (): Sheet => {
      const a = random() * Math.PI * 2;
      const lift = random() * 0.8 - 0.1;
      return { x: Math.cos(a), y: lift, z: Math.sin(a), delay: random() * 0.25 };
    });
  }, []);
  const positions = useMemo(() => new Float32Array(PAPERS * 3), []);

  useFrame((state) => {
    if (done) return;
    if (start.current < 0) start.current = state.clock.elapsedTime;
    const t = state.clock.elapsedTime - start.current;
    if (t >= COMPACTION_SECONDS) {
      setDone(true);
      return;
    }
    flySheets(positions, sheets, t);
    if (points.current)
      (points.current.geometry.getAttribute('position') as BufferAttribute).needsUpdate = true;
    if (paperMaterial.current) dimPaper(paperMaterial.current, t);
    if (cube.current) turnCube(cube.current, t);
    if (ring.current) spreadRing(ring.current, t);
    state.invalidate();
  });

  if (done) return null;
  return (
    <group position={position}>
      <PaperPoints points={points} material={paperMaterial} map={paper} positions={positions} />
      <mesh ref={cube} scale={0.0001}>
        <boxGeometry args={[1, 1, 1]} />
        <meshBasicMaterial color={CONTEXT_COLOR.calm} toneMapped={false} />
      </mesh>
      <GlowRing ring={ring} />
    </group>
  );
}
