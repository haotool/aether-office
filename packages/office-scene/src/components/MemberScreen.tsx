import { SEATING } from '../core/seating.js';
import { useEffect, useMemo, useRef } from 'react';
import { useFrame } from '@react-three/fiber';
import {
  CanvasTexture,
  RepeatWrapping,
  SRGBColorSpace,
  Vector3,
  type Group,
  type Texture,
} from 'three';
import type { Agent } from '@aether/contracts';
import type { DepartmentId } from '@aether/kernel';
import type { DeskProfile } from '../desks/desk-profile.js';
import { SCREEN_H, SCREEN_W } from '../screen/screen-draw.js';
import { screenTexture } from '../screen/screens.js';
import { SECONDARY_H, SECONDARY_W, acquireSecondary } from '../screen/screen-secondary.js';
import {
  BAND,
  createFactsScreen,
  type PaintOptions,
  type ScreenFacts,
} from '../screen/screen-facts.js';
import { context2d } from '../core/canvas-2d.js';

const WIDTH = 0.76;
const HEIGHT = (WIDTH * SCREEN_H) / SCREEN_W;
const SECOND_WIDTH = 0.5;
const SECOND_HEIGHT = (SECOND_WIDTH * SECONDARY_H) / SECONDARY_W;
const STREAM_SPEED = [0, 0.35, 0.9, 2.2] as const;
const TYPING_SPEED = [1, 1.25, 1.5, 1.75] as const;
const PAINT_MS = [200, 500, 1000] as const;
const NEAR = 10;
const MID = 24;

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

type MemberScreenProps = {
  role: string;
  member: string;
  accent: string;
  activity: Agent['activity'];
  facts?: ScreenFacts | undefined;
  theme: DepartmentId;
  intensity: 0 | 1 | 2 | 3;
  profile: DeskProfile;
  reducedMotion: boolean;
  rich: boolean;
};

function useScreenTextures({
  role,
  member,
  accent,
  facts,
  theme,
  profile,
  rich,
}: MemberScreenProps) {
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
  return { live, second, texture, stream };
}

type Textures = ReturnType<typeof useScreenTextures>;

const paintEvery = (distance: number, reducedMotion: boolean) =>
  reducedMotion ? Infinity : PAINT_MS[distance < NEAR ? 0 : distance < MID ? 1 : 2];

const hum = (intensity: number, seconds: number) =>
  intensity === 3 ? Math.sin(seconds * 60) * 0.0016 : 0;

function useScreenLoop(
  { live, second, stream }: Textures,
  {
    facts,
    intensity,
    reducedMotion,
  }: Pick<MemberScreenProps, 'facts' | 'intensity' | 'reducedMotion'>,
) {
  const shake = useRef<Group>(null);
  const here = useRef(new Vector3());
  const paintOptions = useRef<PaintOptions>({ interval: 0, moving: true, speed: 1 });
  useFrame((state, delta) => {
    if (live && facts) {
      const at = shake.current ? shake.current.getWorldPosition(here.current) : here.current;
      const distance = state.camera.position.distanceTo(at);
      paintOptions.current.interval = paintEvery(distance, reducedMotion);
      paintOptions.current.moving = !reducedMotion;
      paintOptions.current.speed = TYPING_SPEED[intensity];
      live.paint(facts, Date.now(), paintOptions.current);
      second?.paint(Date.now(), !reducedMotion);
    }
    if (stream && intensity > 0) stream.offset.y -= delta * STREAM_SPEED[intensity];
    if (shake.current) shake.current.position.x = hum(intensity, state.clock.elapsedTime);
  });
  return shake;
}

const SEEN: readonly Agent['activity'][] = [
  'working',
  'reviewing',
  'waiting_permission',
  'waiting_peer',
];
const opacityOf = (activity: Agent['activity']) =>
  activity === 'offline' || activity === 'unknown' ? 0.12 : SEEN.includes(activity) ? 1 : 0.5;

function SecondMonitor({
  texture,
  side,
  opacity,
}: {
  texture: Texture;
  side: DeskProfile['side'];
  opacity: number;
}) {
  const sign = side === 'left' ? -1 : 1;
  return (
    <mesh position={[sign * 0.62, -0.035, 0.178]} rotation={[0, -sign * 0.42, 0]}>
      <planeGeometry args={[SECOND_WIDTH, SECOND_HEIGHT]} />
      <meshBasicMaterial map={texture} transparent opacity={opacity} toneMapped={false} />
    </mesh>
  );
}

function StreamBand({ texture }: { texture: Texture }) {
  return (
    <mesh position={[((BAND.from + BAND.to) / 2 - 0.5) * WIDTH, 0, 0.002]}>
      <planeGeometry args={[(BAND.to - BAND.from) * WIDTH, HEIGHT * 0.86]} />
      <meshBasicMaterial
        map={texture}
        transparent
        opacity={0.9}
        toneMapped={false}
        depthWrite={false}
        side={2}
      />
    </mesh>
  );
}

export function MemberScreen(props: MemberScreenProps) {
  const { activity, intensity, profile } = props;
  const textures = useScreenTextures(props);
  const shake = useScreenLoop(textures, props);
  const { texture, second, stream } = textures;
  const opacity = opacityOf(activity);
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
      {second && <SecondMonitor texture={second.texture} side={profile.side} opacity={opacity} />}
      {stream && intensity > 0 && <StreamBand texture={stream} />}
    </group>
  );
}
