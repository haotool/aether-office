import { buildNavGrid, findPath, pathLength, type NavGrid, type Point } from '@aether/kernel';
import type { Layout } from '@aether/contracts';

// Message "carriers" are decoration over durable state: a carrier arriving proves nothing about
// delivery or acknowledgement, which remain the recipient delivery states.
export type SceneMessage = { id: string; senderId: string; recipientIds: readonly string[] };
export type Carrier = {
  key: string;
  messageId: string;
  recipientId: string;
  points: Point[];
  length: number;
};
export type CarrierPlan = {
  carriers: Carrier[];
  unreachable: { messageId: string; recipientId: string }[];
  seen: Set<string>;
};

export const gridFor = (layout: Layout): NavGrid => buildNavGrid(layout.objects);

/** Plans carriers only for messages not seen before; the returned `seen` set is the dedupe record. */
export function planCarriers(
  messages: readonly SceneMessage[],
  seen: ReadonlySet<string>,
  layout: Layout,
  grid: NavGrid = gridFor(layout),
  animate = true,
): CarrierPlan {
  const next = new Set(seen);
  const carriers: Carrier[] = [];
  const unreachable: CarrierPlan['unreachable'] = [];
  const seat = (agentId: string) => layout.objects.find((o) => o.agentId === agentId);
  for (const message of messages) {
    if (next.has(message.id)) continue; // messageId dedupe: refetch/reconnect never replays an animation
    next.add(message.id);
    const from = seat(message.senderId);
    if (!animate || !from) continue;
    for (const recipientId of message.recipientIds) {
      const to = seat(recipientId);
      if (!to || recipientId === message.senderId) continue;
      const path = findPath(grid, from, to);
      if (path.status === 'unreachable') unreachable.push({ messageId: message.id, recipientId });
      else
        carriers.push({
          key: `${message.id}:${recipientId}`,
          messageId: message.id,
          recipientId,
          points: path.points,
          length: pathLength(path.points),
        });
    }
  }
  return { carriers, unreachable, seen: next };
}

/** Position `distance` metres along a polyline, clamped to its end. */
export function positionAt(points: readonly Point[], distance: number): Point {
  let remaining = Math.max(0, distance);
  for (let i = 1; i < points.length; i++) {
    const a = points[i - 1]!;
    const b = points[i]!;
    const segment = Math.hypot(b.x - a.x, b.z - a.z);
    if (remaining <= segment && segment > 0) {
      const t = remaining / segment;
      return { x: a.x + (b.x - a.x) * t, z: a.z + (b.z - a.z) * t };
    }
    remaining -= segment;
  }
  return points[points.length - 1] ?? { x: 0, z: 0 };
}
