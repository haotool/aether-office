import { SEATING } from '../core/seating.js';
import { useMemo, useRef, type RefObject } from 'react';
import { useFrame } from '@react-three/fiber';
import {
  AdditiveBlending,
  BufferAttribute,
  CanvasTexture,
  NormalBlending,
  type Blending,
  type Points,
} from 'three';
import { seeded } from '../environment/seeded.js';
import { context2d } from '../core/canvas-2d.js';

const PUFFS = 16;
const SPARKS = 10;

/** One of a desk's random phases (the index is always inside the array: it is taken modulo its length). */
const phaseAt = (phase: Float32Array, i: number) => phase[i] ?? 0;

function softDot(): CanvasTexture {
  const canvas = document.createElement('canvas');
  canvas.width = canvas.height = 64;
  const g = context2d(canvas);
  const fill = g.createRadialGradient(32, 32, 0, 32, 32, 32);
  fill.addColorStop(0, 'rgba(255,255,255,1)');
  fill.addColorStop(1, 'rgba(255,255,255,0)');
  g.fillStyle = fill;
  g.fillRect(0, 0, 64, 64);
  return new CanvasTexture(canvas);
}

/** Smoke puffs curl up from behind the screen, each on its own phase of the rise. */
function curlSmoke(smoke: Float32Array, phase: Float32Array, t: number, rise: number, top: number) {
  for (let i = 0; i < PUFFS; i++) {
    const life = (t * 0.35 + phaseAt(phase, i)) % 1;
    smoke[i * 3] = (phaseAt(phase, (i + 3) % PUFFS) - 0.5) * 0.5 + Math.sin(t + i) * 0.04 * life;
    smoke[i * 3 + 1] = top + life * rise;
    smoke[i * 3 + 2] = -0.32 + Math.cos(t * 0.7 + i) * 0.05 * life;
  }
}

/** Sparks jump off the desk in short arcs. */
function jumpSparks(sparks: Float32Array, phase: Float32Array, t: number) {
  for (let i = 0; i < SPARKS; i++) {
    const life = (t * 1.6 + phaseAt(phase, PUFFS + i)) % 1;
    sparks[i * 3] =
      (phaseAt(phase, (i + 5) % SPARKS) - 0.5) * 0.7 + (phaseAt(phase, i) - 0.5) * life * 0.5;
    sparks[i * 3 + 1] = SEATING.slab.at[1] + 0.05 + Math.sin(life * Math.PI) * 0.35;
    sparks[i * 3 + 2] = -0.1 + (phaseAt(phase, (i + 2) % SPARKS) - 0.5) * 0.3;
  }
}

/** A cloud of soft dots whose positions the frame loop rewrites. */
function Dots({
  innerRef,
  positions,
  map,
  size,
  color,
  opacity,
  blending,
}: {
  innerRef: RefObject<Points | null>;
  positions: Float32Array;
  map: CanvasTexture;
  size: number;
  color: string;
  opacity: number;
  blending: Blending;
}) {
  return (
    <points ref={innerRef}>
      <bufferGeometry>
        <bufferAttribute attach="attributes-position" args={[positions, 3]} />
      </bufferGeometry>
      <pointsMaterial
        map={map}
        size={size}
        color={color}
        transparent
        opacity={opacity}
        depthWrite={false}
        blending={blending}
      />
    </points>
  );
}

/**
 * What a machine does when its member works flat out (intensity 3): grey smoke curls up from behind the screen and
 * sparks jump off the desk. At intensity 2 a thin wisp rises. Nothing at rest, so an idle office is calm.
 */
export function DeskEffects({ intensity, seed }: { intensity: 0 | 1 | 2 | 3; seed: string }) {
  const smoke = useRef<Points>(null);
  const sparks = useRef<Points>(null);
  const dot = useMemo(softDot, []);
  const random = useMemo(() => seeded(seed), [seed]);
  const phase = useMemo(
    () => Float32Array.from({ length: PUFFS + SPARKS }, () => random()),
    [random],
  );
  const base = useMemo(
    () => ({ smoke: new Float32Array(PUFFS * 3), sparks: new Float32Array(SPARKS * 3) }),
    [],
  );
  const top = SEATING.screenY + 0.26;
  useFrame((state) => {
    if (intensity < 2) return;
    const t = state.clock.elapsedTime;
    curlSmoke(base.smoke, phase, t, intensity === 3 ? 0.9 : 0.5, top);
    jumpSparks(base.sparks, phase, t);
    for (const points of [smoke.current, sparks.current])
      if (points) (points.geometry.getAttribute('position') as BufferAttribute).needsUpdate = true;
  });
  if (intensity < 2) return null;
  return (
    <>
      <Dots
        innerRef={smoke}
        positions={base.smoke}
        map={dot}
        size={intensity === 3 ? 0.34 : 0.2}
        color={intensity === 3 ? '#6b7076' : '#9aa6b2'}
        opacity={intensity === 3 ? 0.5 : 0.28}
        blending={NormalBlending}
      />
      {intensity === 3 && (
        <Dots
          innerRef={sparks}
          positions={base.sparks}
          map={dot}
          size={0.07}
          color="#ffb347"
          opacity={0.95}
          blending={AdditiveBlending}
        />
      )}
    </>
  );
}
