import { SEATING } from '../core/seating.js';
import { useRef } from 'react';
import { useFrame } from '@react-three/fiber';
import { AdditiveBlending, CanvasTexture, SRGBColorSpace, type MeshBasicMaterial } from 'three';
import { context2d } from '../core/canvas-2d.js';

// Small, cheap touches around a desk: light from the screen on the desk, a soft footprint under the character where
// there are no real shadows, and a pulsing ring on the floor when the member wants a person. One plane each.

let softDisc: CanvasTexture | null = null;
/** One soft radial gradient (opaque white centre, clear edge) shared by every desk. */
function disc(): CanvasTexture {
  if (softDisc) return softDisc;
  const canvas = document.createElement('canvas');
  canvas.width = canvas.height = 64;
  const g = context2d(canvas);
  const fill = g.createRadialGradient(32, 32, 0, 32, 32, 32);
  fill.addColorStop(0, 'rgba(255,255,255,1)');
  fill.addColorStop(0.5, 'rgba(255,255,255,0.45)');
  fill.addColorStop(1, 'rgba(255,255,255,0)');
  g.fillStyle = fill;
  g.fillRect(0, 0, 64, 64);
  softDisc = new CanvasTexture(canvas);
  softDisc.colorSpace = SRGBColorSpace;
  return softDisc;
}

const DESK_TOP = SEATING.slab.at[1] + 0.03;
/** How much of the screen's light reaches the desk, by how hard the member works (0 to 3). */
const GLOW = [0.14, 0.22, 0.3, 0.4] as const;
const FLAT: [number, number, number] = [-Math.PI / 2, 0, 0];

/** The screen's light spilled on the desk, in the department's colour; stronger the harder the member works. */
export function ScreenGlow({
  accent,
  level,
  on,
}: {
  accent: string;
  level: 0 | 1 | 2 | 3;
  on: boolean;
}) {
  if (!on) return null;
  return (
    <mesh position={[0, DESK_TOP, -0.02]} rotation={FLAT} renderOrder={1}>
      <planeGeometry args={[1.7, 0.95]} />
      <meshBasicMaterial
        map={disc()}
        color={accent}
        transparent
        opacity={GLOW[level]}
        blending={AdditiveBlending}
        depthWrite={false}
        toneMapped={false}
      />
    </mesh>
  );
}

/** A soft dark footprint under the seated member, for the tiers that draw no real shadows. */
export function ContactShadow({ z }: { z: number }) {
  return (
    <mesh position={[0, 0.04, z]} rotation={FLAT} renderOrder={1}>
      <planeGeometry args={[1.25, 1.25]} />
      <meshBasicMaterial
        map={disc()}
        color="#000000"
        transparent
        opacity={0.5}
        depthWrite={false}
      />
    </mesh>
  );
}

const RING_HZ = 0.8;

/** A ring of amber light on the floor round the desk, breathing, when the member wants a person. */
export function AttentionRing({ z, animate }: { z: number; animate: boolean }) {
  const material = useRef<MeshBasicMaterial>(null);
  useFrame(({ clock }) => {
    if (material.current)
      material.current.opacity = animate
        ? 0.45 + 0.4 * Math.sin(clock.elapsedTime * RING_HZ * Math.PI * 2)
        : 0.7;
  });
  return (
    <mesh position={[0, 0.07, z]} rotation={FLAT} renderOrder={1}>
      <ringGeometry args={[1.05, 1.17, 48]} />
      <meshBasicMaterial
        ref={material}
        color="#ffc65c"
        transparent
        opacity={0.7}
        blending={AdditiveBlending}
        depthWrite={false}
        toneMapped={false}
      />
    </mesh>
  );
}
