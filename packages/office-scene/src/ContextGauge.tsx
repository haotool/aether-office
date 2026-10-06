import { useEffect, useRef } from 'react';
import { useFrame } from '@react-three/fiber';
import type { Mesh, MeshBasicMaterial } from 'three';
import { CONTEXT_COLOR, contextLevel, easeOut, tweenSeconds } from './context.js';

const SCREEN_WIDTH = 0.76; // MemberScreen's width
const HEIGHT = 0.72; // a column rising from the desk, taller than the screen so it reads from far away
const WIDTH = 0.09;
const GAP = 0.1; // between the screen's edge and the gauge
const BOTTOM = 0.6; // the desk's surface

/**
 * A thin vertical bar beside the desk monitor: how much of the context window the session has used, filling from the
 * bottom, calm / warm / hot by `contextLevel`. When the share changes the fill moves with an eased tween (the slow fall
 * of a compaction is the same tween over a longer span); it is also the only part of the compaction effect that stays
 * when motion is reduced. Nothing is drawn while the share is unknown.
 */
export function ContextGauge({ percent }: { percent: number | null }) {
  const fill = useRef<Mesh>(null);
  const material = useRef<MeshBasicMaterial>(null);
  const move = useRef({ from: 0, to: 0, start: -1 });
  const shown = useRef<number | null>(null);
  useEffect(() => {
    if (percent === null) {
      shown.current = null;
      return;
    }
    const from = shown.current ?? percent; // the first reading appears in place
    move.current = { from, to: percent, start: -1 };
  }, [percent]);
  useFrame((state) => {
    const m = move.current;
    if (percent === null || !fill.current || !material.current) return;
    if (m.start < 0) m.start = state.clock.elapsedTime;
    const span = tweenSeconds(m.from, m.to);
    const t = (state.clock.elapsedTime - m.start) / span;
    const value = m.from + (m.to - m.from) * easeOut(t);
    shown.current = value;
    const level = Math.max(0, Math.min(100, value));
    fill.current.scale.y = Math.max(0.001, level / 100);
    fill.current.position.y = (-HEIGHT * (1 - level / 100)) / 2;
    material.current.color.set(CONTEXT_COLOR[contextLevel(level)]);
    if (t < 1) state.invalidate(); // the scene may be idle: keep drawing until the fill has arrived
  });
  if (percent === null) return null;
  return (
    <group position={[SCREEN_WIDTH / 2 + GAP, BOTTOM + HEIGHT / 2, -0.3]}>
      <mesh>
        <planeGeometry args={[WIDTH, HEIGHT]} />
        <meshBasicMaterial color="#0a1822" transparent opacity={0.75} toneMapped={false} side={2} />
      </mesh>
      <mesh ref={fill} position={[0, 0, 0.003]}>
        <planeGeometry args={[WIDTH * 0.7, HEIGHT]} />
        <meshBasicMaterial ref={material} toneMapped={false} side={2} />
      </mesh>
    </group>
  );
}
