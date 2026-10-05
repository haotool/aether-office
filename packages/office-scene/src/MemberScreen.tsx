import SEATING from './desk-seating.json';
import { useMemo, useRef } from 'react';
import { useFrame } from '@react-three/fiber';
import { CanvasTexture, RepeatWrapping, SRGBColorSpace, type Group } from 'three';
import type { Agent } from '@aether/contracts';
import type { DepartmentId } from '@aether/kernel';
import { SCREEN_H, SCREEN_W, screenTexture } from './screens.js';
import { BAND, factsTexture, type ScreenFacts } from './screen-facts.js';

const WIDTH = 0.76;
const HEIGHT = (WIDTH * SCREEN_H) / SCREEN_W;
/** How fast the stream runs, in screen heights per second, by how hard the member works. */
const STREAM_SPEED = [0, 0.35, 0.9, 2.2] as const;

/** Bright bars of different lengths on dark: scrolled over the ambient column, they read as work going by. */
function streamTexture(accent: string): CanvasTexture {
  const canvas = document.createElement('canvas');
  canvas.width = 32;
  canvas.height = 256;
  const g = canvas.getContext('2d')!;
  g.fillStyle = accent;
  for (let i = 0; i < 16; i++) {
    g.globalAlpha = 0.25 + ((i * 7) % 5) / 8;
    g.fillRect(2, i * 16 + 3, 6 + ((i * 11) % 22), 8);
  }
  const texture = new CanvasTexture(canvas);
  texture.wrapS = texture.wrapT = RepeatWrapping;
  texture.repeat.set(1, 1.5);
  texture.colorSpace = SRGBColorSpace;
  return texture;
}

/** A member's own screen: what the session is really doing, or role-themed art; its brightness follows the real activity. */
export function MemberScreen({
  role,
  member,
  accent,
  activity,
  facts,
  theme,
  intensity,
}: {
  role: string;
  member: string;
  accent: string;
  activity: Agent['activity'];
  /** What the member is really doing; without it the screen is the role's decorative art. */
  facts?: ScreenFacts | undefined;
  /** The department's look (its title, pattern and stream). */
  theme: DepartmentId;
  /** How hard the member is working, 0 to 3. */
  intensity: 0 | 1 | 2 | 3;
}) {
  const texture = useMemo(
    () => (facts ? factsTexture(facts, accent, theme) : screenTexture(role, member, accent)),
    [facts, role, member, accent, theme],
  );
  const stream = useMemo(() => (facts ? streamTexture(accent) : null), [facts, accent]);
  const shake = useRef<Group>(null);
  useFrame((state, delta) => {
    if (stream && intensity > 0) stream.offset.y -= delta * STREAM_SPEED[intensity];
    if (shake.current)
      shake.current.position.x =
        intensity === 3 ? Math.sin(state.clock.elapsedTime * 60) * 0.0016 : 0; // a machine at its limit hums
  });
  const opacity =
    activity === 'offline' || activity === 'unknown'
      ? 0.12
      : ['working', 'reviewing', 'waiting_permission', 'waiting_peer'].includes(activity)
        ? 1
        : 0.5;
  const bandWidth = (BAND.to - BAND.from) * WIDTH;
  const bandCentre = ((BAND.from + BAND.to) / 2 - 0.5) * WIDTH;
  return (
    <group ref={shake} position={[0, SEATING.screenY, -0.3]}>
      <mesh>
        <planeGeometry args={[WIDTH, HEIGHT]} />
        <meshBasicMaterial
          map={texture}
          color={intensity === 3 ? '#ffc4b4' : '#ffffff'}
          transparent
          opacity={opacity}
          toneMapped={false}
          side={2}
        />
      </mesh>
      {stream && intensity > 0 && (
        <mesh position={[bandCentre, 0, 0.002]}>
          <planeGeometry args={[bandWidth, HEIGHT * 0.86]} />
          <meshBasicMaterial
            map={stream}
            transparent
            opacity={0.9}
            toneMapped={false}
            depthWrite={false}
            side={2}
          />
        </mesh>
      )}
    </group>
  );
}
