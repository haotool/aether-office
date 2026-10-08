import { useEffect, useMemo, useRef, useState } from 'react';
import { useFrame, useThree } from '@react-three/fiber';
import type { Group } from 'three';
import type { Layout } from '@aether/contracts';
import {
  gridFor,
  planCarriers,
  positionAt,
  type Carrier,
  type SceneMessage,
} from '../environment/carriers.js';
import { itemAt } from '../environment/checked.js';

const SPEED = 4; // metres per second
const HEIGHT = 1.5;

type Live = Carrier & { startedAt: number };

function Envelope({ carrier, onDone }: { carrier: Live; onDone: (key: string) => void }) {
  const group = useRef<Group>(null);
  const invalidate = useThree((s) => s.invalidate);
  useFrame(({ clock }) => {
    const travelled = (clock.elapsedTime - carrier.startedAt) * SPEED;
    const p = positionAt(carrier.points, travelled);
    group.current?.position.set(p.x, HEIGHT + Math.sin(travelled * 3) * 0.06, p.z);
    if (travelled >= carrier.length) onDone(carrier.key);
    else invalidate();
  });
  const start = itemAt(carrier.points, 0);
  return (
    <group ref={group} position={[start.x, HEIGHT, start.z]}>
      <mesh>
        <boxGeometry args={[0.46, 0.05, 0.32]} />
        <meshStandardMaterial color="#f4efe0" emissive="#6addE8" emissiveIntensity={0.55} />
      </mesh>
    </group>
  );
}

/**
 * Envelopes walk the collision-free path from sender to recipient desks. This is decoration only:
 * arrival never changes delivery or acknowledgement state.
 */
export function MessageCarriers({
  layout,
  messages,
  reducedMotion,
  onUnreachable,
}: {
  layout: Layout;
  messages: readonly SceneMessage[];
  reducedMotion: boolean;
  onUnreachable?: (messageId: string, recipientId: string) => void;
}) {
  const grid = useMemo(() => gridFor(layout), [layout]);
  const seen = useRef<Set<string> | null>(null);
  const [live, setLive] = useState<Live[]>([]);
  const clock = useThree((s) => s.clock);
  useEffect(() => {
    const first = seen.current === null; // history present at load is marked seen, not replayed
    const plan = planCarriers(
      messages,
      seen.current ?? new Set(),
      layout,
      grid,
      !first && !reducedMotion,
    );
    seen.current = plan.seen;
    for (const u of plan.unreachable) onUnreachable?.(u.messageId, u.recipientId);
    if (plan.carriers.length)
      setLive((current) => [
        ...current,
        ...plan.carriers.map((c) => ({ ...c, startedAt: clock.elapsedTime })),
      ]);
  }, [messages, layout, grid, reducedMotion, clock, onUnreachable]);
  const done = (key: string) => setLive((current) => current.filter((c) => c.key !== key));
  return (
    <>
      {live.map((carrier) => (
        <Envelope key={carrier.key} carrier={carrier} onDone={done} />
      ))}
    </>
  );
}
