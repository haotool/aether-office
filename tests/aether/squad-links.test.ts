import { describe, expect, it } from 'vitest';
import { SEAT_DEPTH } from '../../packages/office-scene/src/animals/departure.js';
import { AISLE, PORT, linkLayout } from '../../packages/office-scene/src/squad/squad-links.js';

const pod = (x: number, z: number, member: string | null = 'm') => ({
  x,
  z,
  member,
  silhouette: false,
  since: 0,
});
const squad = (podRotation: number, pods: ReturnType<typeof pod>[]) => ({
  deskX: 0,
  deskZ: 0,
  podRotation,
  pods,
});
const end = (route: readonly { x: number; z: number }[]) => route[route.length - 1];
const DESK_X = 4.5 - SEAT_DEPTH;

describe('desk links', () => {
  it('runs one trunk out of the supervisor desk and one cross bar per row, so desks share wire', () => {
    const { segments, traces } = linkLayout(
      squad(1, [pod(4.5, -1.2, 'a'), pod(4.5, 1.2, 'b'), pod(7, -1.2, 'c'), pod(7, 1.2, 'd')]),
    );
    expect(traces.map((t) => t.member)).toEqual(['a', 'b', 'c', 'd']);
    expect(segments).toHaveLength(3);
  });

  it('lays each cross bar in the aisle in front of its row of desks, clear of the desktops', () => {
    const { segments } = linkLayout(squad(1, [pod(4.5, -1.2, 'a'), pod(4.5, 1.2, 'b')]));
    const bar = segments.find((s) => Math.abs(s.from.z - s.to.z) > 1);
    expect(bar?.from.x).toBeCloseTo(DESK_X - AISLE);
    expect(bar?.to.x).toBeCloseTo(DESK_X - AISLE);
    expect(Math.min(bar?.from.z ?? 0, bar?.to.z ?? 0)).toBeCloseTo(-1.2);
    expect(Math.max(bar?.from.z ?? 0, bar?.to.z ?? 0)).toBeCloseTo(1.2);
  });

  it('ends every trace at the front edge of its desk, after turning off the bar', () => {
    const { traces } = linkLayout(squad(1, [pod(4.5, -1.2, 'a')]));
    const route = traces[0]?.route ?? [];
    expect(route[0]?.x).toBeCloseTo(0);
    expect(route[0]?.z).toBeCloseTo(0);
    expect(route[1]?.x).toBeCloseTo(DESK_X - AISLE);
    expect(route[1]?.z).toBeCloseTo(0);
    expect(route[2]?.x).toBeCloseTo(DESK_X - AISLE);
    expect(route[2]?.z).toBeCloseTo(-1.2);
    expect(end(route)?.x).toBeCloseTo(DESK_X - PORT);
    expect(end(route)?.z).toBeCloseTo(-1.2);
  });

  it('puts one port across the front of every seated desk', () => {
    const { ports } = linkLayout(squad(1, [pod(4.5, -1.2, 'a'), pod(4.5, 1.2, null)]));
    expect(ports).toHaveLength(1);
    const [port] = ports;
    expect(port?.from.x).toBeCloseTo(DESK_X - PORT);
    expect(port?.to.x).toBeCloseTo(DESK_X - PORT);
    expect((port?.from.z ?? 0) + (port?.to.z ?? 0)).toBeCloseTo(-2.4);
  });

  it('leaves out pods nobody sits at', () => {
    const { traces } = linkLayout(squad(1, [pod(4.5, -1.2, 'a'), pod(4.5, 1.2, null)]));
    expect(traces.map((t) => t.member)).toEqual(['a']);
  });

  it('turns with the zone: the trunk always leaves along the way the pods face away', () => {
    for (const rotation of [0, 1, 2, 3]) {
      const yaw = (rotation * Math.PI) / 2;
      const ahead = [Math.sin(yaw), Math.cos(yaw)] as const;
      const { traces } = linkLayout(
        squad(rotation, [pod(ahead[0] * (3 + SEAT_DEPTH), ahead[1] * (3 + SEAT_DEPTH))]),
      );
      const route = traces[0]?.route ?? [];
      expect(end(route)?.x).toBeCloseTo(ahead[0] * (3 - PORT));
      expect(end(route)?.z).toBeCloseTo(ahead[1] * (3 - PORT));
    }
  });

  it('runs the trunk down the aisle between two desk columns, never under a desk', () => {
    const { segments } = linkLayout(squad(1, [pod(4.5, 0, 'a'), pod(4.5, 1.6, 'b')]));
    const [trunk] = segments;
    expect(trunk?.from.x).toBeCloseTo(0);
    expect(trunk?.to.x).toBeCloseTo(DESK_X - AISLE);
    expect(trunk?.from.z).toBeCloseTo(0.8);
    expect(trunk?.to.z).toBeCloseTo(0.8);
  });

  it('keeps the trunk where it is while empty pods fill up', () => {
    const waiting = linkLayout(squad(1, [pod(4.5, 0, 'a'), pod(4.5, 1.6, null)]));
    const seated = linkLayout(squad(1, [pod(4.5, 0, 'a'), pod(4.5, 1.6, 'b')]));
    expect(waiting.segments[0]).toEqual(seated.segments[0]);
  });

  it('draws nothing for a zone without anyone seated', () => {
    expect(linkLayout(squad(1, [pod(4.5, 0, null)]))).toEqual({
      segments: [],
      ports: [],
      traces: [],
    });
  });
});
