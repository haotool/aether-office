import { SEATING } from './seating.js';
import { useMemo, useRef } from 'react';
import { useFrame } from '@react-three/fiber';
import {
  AdditiveBlending,
  BufferAttribute,
  CanvasTexture,
  NormalBlending,
  type Points,
} from 'three';
import { seeded } from './random.js';
import { context2d } from './canvas-2d.js';

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
    const rise = intensity === 3 ? 0.9 : 0.5;
    for (let i = 0; i < PUFFS; i++) {
      const life = (t * 0.35 + phaseAt(phase, i)) % 1;
      base.smoke[i * 3] =
        (phaseAt(phase, (i + 3) % PUFFS) - 0.5) * 0.5 + Math.sin(t + i) * 0.04 * life;
      base.smoke[i * 3 + 1] = top + life * rise;
      base.smoke[i * 3 + 2] = -0.32 + Math.cos(t * 0.7 + i) * 0.05 * life;
    }
    for (let i = 0; i < SPARKS; i++) {
      const life = (t * 1.6 + phaseAt(phase, PUFFS + i)) % 1;
      base.sparks[i * 3] =
        (phaseAt(phase, (i + 5) % SPARKS) - 0.5) * 0.7 + (phaseAt(phase, i) - 0.5) * life * 0.5;
      base.sparks[i * 3 + 1] = SEATING.slab.at[1] + 0.05 + Math.sin(life * Math.PI) * 0.35;
      base.sparks[i * 3 + 2] = -0.1 + (phaseAt(phase, (i + 2) % SPARKS) - 0.5) * 0.3;
    }
    for (const points of [smoke.current, sparks.current])
      if (points) (points.geometry.getAttribute('position') as BufferAttribute).needsUpdate = true;
  });
  if (intensity < 2) return null;
  return (
    <>
      <points ref={smoke}>
        <bufferGeometry>
          <bufferAttribute attach="attributes-position" args={[base.smoke, 3]} />
        </bufferGeometry>
        <pointsMaterial
          map={dot}
          size={intensity === 3 ? 0.34 : 0.2}
          color={intensity === 3 ? '#6b7076' : '#9aa6b2'}
          transparent
          opacity={intensity === 3 ? 0.5 : 0.28}
          depthWrite={false}
          blending={NormalBlending}
        />
      </points>
      {intensity === 3 && (
        <points ref={sparks}>
          <bufferGeometry>
            <bufferAttribute attach="attributes-position" args={[base.sparks, 3]} />
          </bufferGeometry>
          <pointsMaterial
            map={dot}
            size={0.07}
            color="#ffb347"
            transparent
            opacity={0.95}
            depthWrite={false}
            blending={AdditiveBlending}
          />
        </points>
      )}
    </>
  );
}
