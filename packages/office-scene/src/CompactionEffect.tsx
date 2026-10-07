import { useEffect, useMemo, useRef, useState } from 'react';
import { useFrame } from '@react-three/fiber';
import {
  BufferAttribute,
  CanvasTexture,
  SRGBColorSpace,
  type Mesh,
  type Points,
  type PointsMaterial,
} from 'three';
import { COMPACTION_SECONDS, CONTEXT_COLOR, easeOut } from './context.js';
import { seeded } from './random.js';
import { context2d } from './canvas-2d.js';

const PAPERS = 40;
const BURST_END = 0.8; // seconds: the sheets fly out ...
const GATHER_END = 1.5; // ... then are drawn into one point
const CUBE_END = 2.3; // the cube glows, then fades by COMPACTION_SECONDS
const RADIUS = 0.62;

/** One small sheet of paper with a few lines on it: the sprite of every particle (tinted by the material). */
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

/**
 * The "tidying up" of a compaction, played once above the member's head over COMPACTION_SECONDS: a burst of paper
 * sheets flies out, is drawn into a small glowing cube, and a soft ring spreads from it. All sheets are one Points draw;
 * the cube and the ring are one mesh each. Mount it with a fresh `key` per compaction; it removes itself when done.
 */
export function CompactionEffect({ position }: { position: [number, number, number] }) {
  const points = useRef<Points>(null);
  const paperMaterial = useRef<PointsMaterial>(null);
  const cube = useRef<Mesh>(null);
  const ring = useRef<Mesh>(null);
  const start = useRef(-1);
  const [done, setDone] = useState(false);
  const paper = useMemo(paperTexture, []);
  useEffect(() => () => paper.dispose(), [paper]);
  // Each sheet's direction and spin are fixed up front: the frame only moves them along it.
  const sheets = useMemo(() => {
    const random = seeded('compaction');
    return Array.from({ length: PAPERS }, () => {
      const a = random() * Math.PI * 2;
      const lift = random() * 0.8 - 0.1; // mostly up and out, a few sideways
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
    sheets.forEach((s, i) => {
      const out = easeOut((t - s.delay) / (BURST_END - s.delay)) * RADIUS;
      const gather = Math.min(1, Math.max(0, (t - BURST_END) / (GATHER_END - BURST_END)));
      const pull = gather * gather; // slow start, quick finish into the cube
      const r = out * (1 - pull);
      positions[i * 3] = s.x * r;
      positions[i * 3 + 1] = s.y * r * 0.8 + 0.1 * Math.sin(t * 5 + i) * (1 - pull);
      positions[i * 3 + 2] = s.z * r;
    });
    if (points.current) {
      (points.current.geometry.getAttribute('position') as BufferAttribute).needsUpdate = true;
    }
    const material = paperMaterial.current;
    if (material) {
      material.opacity = t < GATHER_END ? 0.95 : Math.max(0, 1 - (t - GATHER_END) * 6);
      material.size = 0.3 * (1 - 0.7 * Math.min(1, Math.max(0, (t - BURST_END) / 0.7)));
    }
    if (cube.current) {
      const grow = Math.min(1, Math.max(0, (t - (GATHER_END - 0.2)) / 0.25));
      const fade = Math.min(1, Math.max(0, (t - CUBE_END) / (COMPACTION_SECONDS - CUBE_END)));
      const pop = easeOut(grow) * (1 + 0.25 * Math.sin(grow * Math.PI)); // a small overshoot
      cube.current.scale.setScalar(Math.max(0.0001, pop * (1 - fade) * 0.17));
      cube.current.rotation.set(t * 1.4, t * 2.1, 0);
    }
    if (ring.current) {
      const k = Math.min(1, Math.max(0, (t - GATHER_END) / 0.8));
      ring.current.scale.setScalar(0.1 + easeOut(k) * 1.9);
      (ring.current.material as { opacity: number }).opacity = k > 0 && k < 1 ? 0.7 * (1 - k) : 0;
    }
    state.invalidate();
  });

  if (done) return null;
  return (
    <group position={position}>
      <points ref={points} frustumCulled={false}>
        <bufferGeometry>
          <bufferAttribute attach="attributes-position" args={[positions, 3]} />
        </bufferGeometry>
        <pointsMaterial
          ref={paperMaterial}
          map={paper}
          size={0.3}
          color="#f4fbff"
          transparent
          depthWrite={false}
          toneMapped={false}
        />
      </points>
      <mesh ref={cube} scale={0.0001}>
        <boxGeometry args={[1, 1, 1]} />
        <meshBasicMaterial color={CONTEXT_COLOR.calm} toneMapped={false} />
      </mesh>
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
    </group>
  );
}
