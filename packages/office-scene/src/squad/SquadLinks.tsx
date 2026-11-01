import { useEffect, useLayoutEffect, useMemo, useRef, type RefObject } from 'react';
import { useFrame, useThree } from '@react-three/fiber';
import { Color, Quaternion, Vector3, type InstancedMesh } from 'three';
import { pathLength } from '../animals/departure.js';
import { positionAt } from '../environment/carriers.js';
import { hashText } from '../environment/hash.js';
import { floorY } from '../scene/scene-geometry.js';
import type { Quality } from '../scene/scene-types.js';
import { beamIntensity, beamRate } from './beam-rate.js';
import {
  DESK_TOP,
  FLOOR_LIFT,
  WAITING_AMBER,
  art,
  colorOf,
  finishInstances,
  squadMaterials,
  withColors,
  writeInstance,
} from './squad-art.js';
import type { DrawSquad } from './squad-draw.js';
import { linkLayout, type LinkLayout, type Segment, type Trace } from './squad-links.js';
import type { SquadMemberState, SquadZoneState } from './squad-model.js';
import type { Point2 } from './squad-glide.js';
import type { SquadFrame } from './use-squad.js';

const SQUAD_CAPACITY = 16;
const MEMBER_CAPACITY = 12;
export const PACKETS_PER_TRACE: Record<Quality, number> = { high: 2, balanced: 1, low: 0 };
const LAYERS = [
  { width: 0.16, gain: 0.28 },
  { width: 0.045, gain: 1 },
] as const;
const SQUAD_INSTANCES =
  LAYERS.length * (1 + 2 * MEMBER_CAPACITY) + MEMBER_CAPACITY * PACKETS_PER_TRACE.high;
const LINK_CAPACITY = SQUAD_CAPACITY * SQUAD_INSTANCES;
const WIRE_LIFT = 0.015;
const DESK_LIFT = 0.01;
const PACKET = [0.4, 0.1] as const;
const GAP = 1.6;
const LAG_S = 0.6;
const IDLE = 0.05;
const SPEED = [1.2, 5] as const;
const UP = new Vector3(0, 1, 0);
const turn = new Quaternion();
const shade = new Color();
const wire = new Color();
const amber = new Color();
const glint = new Color();
const spot: [number, number, number] = [0, 0, 0];
const size: [number, number, number] = [1, 1, 1];

type Lag = { level: number; phase: number };
type Pen = { mesh: InstancedMesh; n: number; changed: boolean };

const staffed = (members: Readonly<Record<string, SquadMemberState>>, supervisor: string) => {
  for (const id in members) {
    const m = members[id];
    if (m && m.supervisor === supervisor && m.phase !== 'leaving') return true;
  }
  return false;
};

const targetLevel = (busy: boolean, zone: SquadZoneState | undefined, now: number) =>
  busy ? Math.max(IDLE, beamIntensity(beamRate(zone, now))) : IDLE;

function approach(entry: Lag, target: number, delta: number, animate: boolean): boolean {
  entry.level += (target - entry.level) * (1 - Math.exp(-delta / LAG_S));
  const settling = Math.abs(target - entry.level) > 0.004;
  if (!settling) entry.level = target;
  if (animate) entry.phase += delta * (SPEED[0] + (SPEED[1] - SPEED[0]) * entry.level);
  return settling;
}

const yawOf = (dx: number, dz: number) => (dx === 0 && dz === 0 ? 0 : Math.atan2(-dz, dx));

function put(
  pen: Pen,
  at: Point2,
  y: number,
  yaw: number,
  scale: readonly [number, number],
  color: Color,
) {
  if (pen.n >= LINK_CAPACITY) return;
  spot[0] = at.x;
  spot[1] = y;
  spot[2] = at.z;
  size[0] = scale[0];
  size[2] = scale[1];
  pen.changed =
    writeInstance(pen.mesh, pen.n++, spot, turn.setFromAxisAngle(UP, yaw), size, color) ||
    pen.changed;
}

function drawLines(pen: Pen, lines: readonly Segment[], y: number, tone: Color) {
  for (const { width, gain } of LAYERS) {
    shade.copy(tone).multiplyScalar(gain);
    for (const { from, to } of lines) {
      const dx = to.x - from.x;
      const dz = to.z - from.z;
      const middle = { x: (from.x + to.x) / 2, z: (from.z + to.z) / 2 };
      put(pen, middle, y, yawOf(dx, dz), [Math.hypot(dx, dz), width], shade);
    }
  }
}

function drawPackets(pen: Pen, trace: Trace, y: number, phase: number, count: number) {
  const total = pathLength(trace.route);
  const period = total + GAP;
  const offset = (hashText(trace.member) % 100) / 100;
  for (let k = 0; k < count; k++) {
    const d = (phase + ((k + offset) * period) / count) % period;
    if (d > total) continue;
    const at = positionAt(trace.route, d);
    const next = positionAt(trace.route, d + 0.1);
    put(pen, at, y + 0.004, yawOf(next.x - at.x, next.z - at.z), PACKET, glint);
  }
}

type LinkProps = {
  squads: readonly DrawSquad[];
  frame: SquadFrame;
  exploded: boolean;
  animate: boolean;
  quality: Quality;
};

function drawSquad(
  pen: Pen,
  s: DrawSquad,
  layout: LinkLayout,
  p: LinkProps,
  entry: Lag,
  time: number,
) {
  const { members } = p.frame.state.current;
  const floor = floorY(s.floor, p.exploded) + FLOOR_LIFT;
  const accent = colorOf(s.accent);
  wire.copy(accent).multiplyScalar(0.3 + 0.7 * entry.level);
  drawLines(pen, layout.segments, floor + WIRE_LIFT, wire);
  amber.copy(colorOf(WAITING_AMBER)).multiplyScalar(0.6 + 0.4 * Math.sin(time * 3));
  for (const port of layout.ports) {
    const tone = members[port.member]?.waiting ? amber : wire;
    drawLines(pen, [port], floor + DESK_TOP + DESK_LIFT, tone);
  }
  const packets = p.animate ? PACKETS_PER_TRACE[p.quality] : 0;
  glint.set('#ffffff').lerp(accent, 0.35);
  for (const trace of layout.traces) {
    if (packets > 0 && !members[trace.member]?.waiting) {
      drawPackets(pen, trace, floor + WIRE_LIFT, entry.phase, packets);
    }
  }
}

type Rig = { mesh: RefObject<InstancedMesh | null>; lag: Map<string, Lag> };

function update(
  rig: Rig,
  p: LinkProps,
  layouts: readonly LinkLayout[],
  time: number,
  delta: number,
): boolean {
  const mesh = rig.mesh.current;
  if (!mesh) return false;
  const now = Date.now();
  const { members, zones } = p.frame.state.current;
  const pen: Pen = { mesh, n: 0, changed: false };
  let settling = false;
  p.squads.slice(0, SQUAD_CAPACITY).forEach((s, i) => {
    const layout = layouts[i];
    if (!layout) return;
    const target = targetLevel(staffed(members, s.supervisor), zones[s.supervisor], now);
    const entry = rig.lag.get(s.supervisor) ?? { level: target, phase: 0 };
    settling = approach(entry, target, delta, p.animate) || settling;
    rig.lag.set(s.supervisor, entry);
    drawSquad(pen, s, layout, p, entry, time);
  });
  finishInstances(mesh, pen.n, pen.changed);
  return settling || (p.animate && pen.n > 0);
}

export function SquadLinks(props: LinkProps) {
  const { squads } = props;
  const invalidate = useThree((s) => s.invalidate);
  const mesh = useRef<InstancedMesh>(null);
  const lag = useRef(new Map<string, Lag>()).current;
  const rig = useMemo<Rig>(() => ({ mesh, lag }), [mesh, lag]);
  const layouts = useMemo(() => squads.map(linkLayout), [squads]);
  useLayoutEffect(() => withColors(mesh.current), []);
  useEffect(() => {
    invalidate();
  }, [squads, invalidate]);
  useFrame(({ clock }, delta) => {
    if (update(rig, props, layouts, clock.elapsedTime, delta)) invalidate();
  });
  return (
    <instancedMesh
      ref={mesh}
      args={[art().trace, squadMaterials().glow, LINK_CAPACITY]}
      frustumCulled={false}
      renderOrder={2}
    />
  );
}
