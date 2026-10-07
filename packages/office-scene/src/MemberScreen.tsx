import { SEATING } from './seating.js';
import { useEffect, useMemo, useRef } from 'react';
import { useFrame } from '@react-three/fiber';
import { CanvasTexture, RepeatWrapping, SRGBColorSpace, Vector3, type Group } from 'three';
import type { Agent } from '@aether/contracts';
import type { DepartmentId } from '@aether/kernel';
import type { DeskProfile } from './desk-profile.js';
import { SCREEN_H, SCREEN_W } from './screen-draw.js';
import { screenTexture } from './screens.js';
import { SECONDARY_H, SECONDARY_W, acquireSecondary } from './screen-secondary.js';
import { BAND, createFactsScreen, type PaintOptions, type ScreenFacts } from './screen-facts.js';
import { context2d } from './canvas-2d.js';

const WIDTH = 0.76;
const HEIGHT = (WIDTH * SCREEN_H) / SCREEN_W;
/** The second monitor stands where the desk's own side pane does (building-furniture.ts), a hair in front of it. */
const SECOND_WIDTH = 0.5;
const SECOND_HEIGHT = (SECOND_WIDTH * SECONDARY_H) / SECONDARY_W;
/** How fast the stream runs, in screen heights per second, by how hard the member works. */
const STREAM_SPEED = [0, 0.35, 0.9, 2.2] as const;
/** How a member types faster as it works harder, as a multiple of its own pace. */
const TYPING_SPEED = [1, 1.25, 1.5, 1.75] as const;
/** Least ms between two paints of a screen by the camera's distance from it: a close screen is read, a far one only seen. */
const PAINT_MS = [200, 500, 1000] as const;
const NEAR = 10;
const MID = 24;

/** Bright bars of different lengths on dark: scrolled over the ambient column, they read as work going by. */
function streamTexture(accent: string): CanvasTexture {
  const canvas = document.createElement('canvas');
  canvas.width = 32;
  canvas.height = 256;
  const g = context2d(canvas);
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

/** A member's own screen (and second monitor): what the session is really doing, or role-themed art; its brightness follows the real activity. */
export function MemberScreen({
  role,
  member,
  accent,
  activity,
  facts,
  theme,
  intensity,
  profile,
  reducedMotion,
  rich,
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
  /** How the desk is dressed: editor theme, window chrome, second monitor. */
  profile: DeskProfile;
  reducedMotion: boolean;
  /** Room for the extras of a desk: the second monitor (not on a phone or at low quality). */
  rich: boolean;
}) {
  const real = facts !== undefined;
  const live = useMemo(
    () => (real ? createFactsScreen(accent, theme, member, role, profile) : null),
    [real, accent, theme, member, role, profile],
  );
  useEffect(() => () => live?.dispose(), [live]);
  const second = useMemo(
    () =>
      real && rich && profile.secondary
        ? acquireSecondary(profile.secondary, profile.theme, accent)
        : null,
    [real, rich, profile, accent],
  );
  useEffect(() => () => second?.release(), [second]);
  const texture = useMemo(
    () => live?.texture ?? screenTexture(role, member, accent),
    [live, role, member, accent],
  );
  const stream = useMemo(() => (real ? streamTexture(accent) : null), [real, accent]);
  const shake = useRef<Group>(null);
  const here = useRef(new Vector3());
  const paintOptions = useRef<PaintOptions>({ interval: 0, moving: true, speed: 1 }); // reused, so a frame allocates nothing
  useFrame((state, delta) => {
    if (live && facts) {
      // A screen is repainted at the pace its distance from the camera deserves, and only when a paint is due.
      const at = shake.current ? shake.current.getWorldPosition(here.current) : here.current;
      const distance = state.camera.position.distanceTo(at);
      const interval = reducedMotion
        ? Infinity
        : PAINT_MS[distance < NEAR ? 0 : distance < MID ? 1 : 2];
      paintOptions.current.interval = interval;
      paintOptions.current.moving = !reducedMotion;
      paintOptions.current.speed = TYPING_SPEED[intensity];
      live.paint(facts, Date.now(), paintOptions.current);
      second?.paint(Date.now(), !reducedMotion);
    }
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
  const sideSign = profile.side === 'left' ? -1 : 1;
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
      {second && (
        <mesh position={[sideSign * 0.62, -0.035, 0.178]} rotation={[0, -sideSign * 0.42, 0]}>
          <planeGeometry args={[SECOND_WIDTH, SECOND_HEIGHT]} />
          <meshBasicMaterial
            map={second.texture}
            transparent
            opacity={opacity}
            toneMapped={false}
          />
        </mesh>
      )}
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
