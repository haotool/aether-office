import { useEffect, useLayoutEffect, useMemo, useRef } from 'react';
import { useFrame, useThree } from '@react-three/fiber';
import {
  Color,
  Vector3,
  type Camera,
  type InstancedMesh,
  type InterleavedBufferAttribute,
} from 'three';
import { distanceFade } from '../../environment/interplay.js';
import { floorY } from '../../scene/scene-geometry.js';
import type { Quality } from '../../scene/scene-types.js';
import {
  WAITING_AMBER,
  squadMaterials,
  withColors,
  writeInstances,
  type Instance,
} from '../squad-art.js';
import type { DrawSquad } from '../squad-draw.js';
import type { Point2 } from '../squad-glide.js';
import type { SquadFrame } from '../use-squad.js';
import { MASTER_Y, anchorsOf } from './anchors.js';
import { crossGeometry } from './puppet-art.js';
import { STRING_WIDTH, createStringLines } from './string-lines.js';
import {
  MEMBER_CAPACITY,
  STRINGS_PER_MEMBER,
  createRig,
  updateRig,
  type RigMember,
} from './rig.js';
import type { StringPhase } from './string-motion.js';
import { POINTS } from './verlet.js';

/** Simulation rate by tier, and what it drops to past 45 m; past 90 m the strings keep their shape. */
const HZ: Record<Quality, number> = { high: 30, balanced: 20, low: 0 };
const FAR_HZ = 10;
const FAR_M = 45;
const FROZEN_M = 90;
/** At the body end a string is this much of the cross's brightness (the light-string look). */
const BODY_LIGHT = 0.25;
/** The master thread is a little fainter than the strings on the body. */
const MASTER_LIGHT = 0.7;
const SEGMENTS = POINTS - 1;
/** Still strings (reduced motion, Calm) are redrawn at most this often, when something moved. */
const STILL_EVERY_S = 0.2;
/** A frame that took longer than this is a stall: the strings do not owe it a burst. */
const MAX_WAIT_S = 0.25;

const phaseOf = (m: { phase: string; waiting: boolean; working: boolean }): StringPhase =>
  m.phase === 'leaving' ? 'finished' : m.waiting ? 'waiting' : m.working ? 'working' : 'idle';

type Rig = ReturnType<typeof createRig>;
type SquadMembers = SquadFrame['state']['current']['members'];

/** What the simulation needs of each live subagent, with its squad and how far the camera is from it. */
type Gathered = {
  members: RigMember[];
  squadOfMember: DrawSquad[];
  distances: number[];
  nearest: number;
};

/** Every subagent that has strings (seated or leaving, not still arriving), and the distance of the nearest to the camera. */
function gather(
  all: SquadMembers,
  seatOf: ReadonlyMap<string, SquadFrame['seats'][number]>,
  squadOf: ReadonlyMap<string, DrawSquad>,
  podPos: ReadonlyMap<string, Point2>,
  exploded: boolean,
  camera: Camera,
  probe: Vector3,
): Gathered {
  const members: RigMember[] = [];
  const squadOfMember: DrawSquad[] = [];
  const distances: number[] = [];
  let nearest = Infinity;
  for (const m of Object.values(all)) {
    const seat = seatOf.get(m.id);
    const squad = squadOf.get(m.supervisor);
    if (!seat || !squad || m.phase === 'arriving') continue;
    const at = podPos.get(m.id) ?? seat;
    const y = floorY(seat.floor, exploded);
    const distance = camera.position.distanceTo(probe.set(at.x, y + 1.5, at.z));
    squadOfMember.push(squad);
    distances.push(distance);
    nearest = Math.min(nearest, distance);
    members.push({
      id: m.id,
      phase: phaseOf(m),
      toolAt: m.toolAt,
      sockets: anchorsOf(m.id),
      chair: { x: at.x, z: at.z, yaw: (seat.rotation * Math.PI) / 2, y },
      master: [squad.chairX, y + MASTER_Y, squad.chairZ],
    });
  }
  return { members, squadOfMember, distances, nearest };
}

/** The line buffers the strings are written into: segment endpoints, and their colours. */
type Buffers = { positions: Float32Array; rgb: Float32Array };

/** One string's segments, each fading from the cross to the body end. Returns the next free segment. */
function writeString(
  rig: Rig,
  b: Buffers,
  from: number,
  segment: number,
  hue: Color,
  light: number,
) {
  const pos = rig.strings.pos;
  for (let p = 0; p < SEGMENTS; p++) {
    const o = segment * 6;
    for (let n = 0; n < 6; n++) b.positions[o + n] = pos[from + p * 3 + n] ?? 0;
    const a = light * (1 - (1 - BODY_LIGHT) * (p / SEGMENTS));
    const c = light * (1 - (1 - BODY_LIGHT) * ((p + 1) / SEGMENTS));
    b.rgb[o] = hue.r * a;
    b.rgb[o + 1] = hue.g * a;
    b.rgb[o + 2] = hue.b * a;
    b.rgb[o + 3] = hue.r * c;
    b.rgb[o + 4] = hue.g * c;
    b.rgb[o + 5] = hue.b * c;
    segment++;
  }
  return segment;
}

/** Writes one visible member's four strings and its cross from `segment` on; returns the segment after them (the same when it is not visible). */
function writeMember(
  rig: Rig,
  b: Buffers,
  g: Gathered,
  i: number,
  tone: (hex: string) => Color,
  crossItems: Instance[],
  from: number,
): number {
  const m = g.members[i];
  const squad = g.squadOfMember[i];
  const slot = m ? rig.slots.get(m.id) : undefined;
  const motion = m ? rig.motions.get(m.id) : undefined;
  if (!m || !squad || slot === undefined || !motion) return from;
  const light = motion.alpha * distanceFade(g.distances[i] ?? Infinity);
  if (light <= 0.01) return from;
  const hue = tone(m.phase === 'waiting' ? WAITING_AMBER : squad.accent);
  const first = slot * STRINGS_PER_MEMBER * POINTS * 3;
  let segment = from;
  for (let k = 0; k < STRINGS_PER_MEMBER; k++) {
    const weight = k === STRINGS_PER_MEMBER - 1 ? MASTER_LIGHT : 1;
    segment = writeString(rig, b, first + k * POINTS * 3, segment, hue, light * weight);
  }
  const pos = rig.strings.pos;
  crossItems.push({
    at: [pos[first] ?? 0, pos[first + 1] ?? 0, pos[first + 2] ?? 0],
    yaw: m.chair.yaw,
    color: hue.clone().multiplyScalar(0.35 + 0.65 * light),
  });
  return segment;
}

/** Writes every visible member's four strings and its cross; returns how many segments were written. */
function writeStrings(
  rig: Rig,
  b: Buffers,
  g: Gathered,
  tone: (hex: string) => Color,
  crossItems: Instance[],
): number {
  let segment = 0;
  for (let i = 0; i < g.members.length; i++)
    segment = writeMember(rig, b, g, i, tone, crossItems, segment);
  return segment;
}

type PuppetStringsProps = {
  squads: readonly DrawSquad[];
  frame: SquadFrame;
  exploded: boolean;
  simulate: boolean;
  quality: Quality;
  podPos: ReadonlyMap<string, Point2>;
};

/** The one `LineSegments2` that holds every string of the scene, disposed with the layer. */
function useStringLines() {
  const lines = useMemo(createStringLines, []);
  const { geometry, material } = lines;
  useEffect(
    () => () => {
      geometry.dispose();
      material.dispose();
    },
    [geometry, material],
  );
  return lines;
}

/** What `gather` looks members up in: the seat of each, the squad of each supervisor, and a scratch vector. */
function useGatherInputs(frame: SquadFrame, squads: readonly DrawSquad[]) {
  const probe = useMemo(() => new Vector3(), []);
  const seatOf = useMemo(() => new Map(frame.seats.map((s) => [s.member, s])), [frame.seats]);
  const squadOf = useMemo(() => new Map(squads.map((s) => [s.supervisor, s])), [squads]);
  return { seatOf, squadOf, probe };
}

/** The lines are a fixed number of CSS pixels wide, so their material is told the canvas's size in device pixels. */
function fitToCanvas(
  material: ReturnType<typeof createStringLines>['material'],
  ratio: number,
  size: { width: number; height: number },
) {
  material.resolution.set(size.width * ratio, size.height * ratio);
  material.linewidth = STRING_WIDTH * ratio;
}

/** A colour by hex, made once and kept. */
function useTone() {
  const colors = useMemo(() => new Map<string, Color>(), []);
  return (hex: string) => {
    const known = colors.get(hex) ?? new Color(hex);
    colors.set(hex, known);
    return known;
  };
}

/** Writes the strings of this step into the line buffers and returns the control crosses to draw. */
function writeLines(
  rig: Rig,
  { lines, geometry }: ReturnType<typeof createStringLines>,
  gathered: Gathered,
  tone: (hex: string) => Color,
): Instance[] {
  const start = geometry.getAttribute('instanceStart') as InterleavedBufferAttribute;
  const colorStart = geometry.getAttribute('instanceColorStart') as InterleavedBufferAttribute;
  const buffers = {
    positions: start.data.array as Float32Array,
    rgb: colorStart.data.array as Float32Array,
  };
  const crossItems: Instance[] = [];
  const segment = writeStrings(rig, buffers, gathered, tone, crossItems);
  geometry.instanceCount = segment;
  start.data.needsUpdate = true;
  colorStart.data.needsUpdate = true;
  lines.visible = segment > 0;
  return crossItems;
}

/**
 * Puppet strings: light strings from a control cross over each live subagent to its head and two hands, and a master
 * thread from the cross to the supervisor. Every string of the scene is one `LineSegments2` (one draw) plus one instanced
 * mesh for the crosses. The strings follow the subagent and never pull it. `simulate` off (reduced motion, Calm) draws
 * straight, still lines; the layer is not mounted at all on the low tier or when the person turned the strings off.
 */
export function PuppetStrings(props: PuppetStringsProps) {
  const { squads, frame, exploded, simulate, quality, podPos } = props;
  const invalidate = useThree((s) => s.invalidate);
  const rig = useMemo(() => createRig(), []);
  const { glow } = squadMaterials();
  const crosses = useRef<InstancedMesh>(null);
  const { seatOf, squadOf, probe } = useGatherInputs(frame, squads);
  const stringLines = useStringLines();
  useLayoutEffect(() => withColors(crosses.current), []);
  useEffect(() => invalidate(), [squads, simulate, quality, invalidate]);
  const tone = useTone();
  // The simulation runs at its own rate (30 Hz, less far away): frames between two steps change nothing, so they cost nothing.
  const pace = useRef({ wait: Infinity, hz: HZ[quality] || FAR_HZ });
  useEffect(() => {
    pace.current.wait = Infinity; // a new set of squads, or a new setting: draw at once
  }, [squads, simulate, quality, podPos]);
  useFrame(({ camera, gl, size }, delta) => {
    pace.current.wait += delta;
    if (pace.current.wait < (simulate ? 1 / pace.current.hz : STILL_EVERY_S)) return;
    const dt = Math.min(pace.current.wait, MAX_WAIT_S);
    pace.current.wait = 0;
    fitToCanvas(stringLines.material, gl.getPixelRatio(), size);
    const members = frame.state.current.members;
    const gathered = gather(members, seatOf, squadOf, podPos, exploded, camera, probe);
    // The nearest subagent sets the pace: far from the camera the simulation slows, and then holds.
    const hz = gathered.nearest > FAR_M ? FAR_HZ : HZ[quality] || FAR_HZ;
    pace.current.hz = hz;
    updateRig(rig, gathered.members, gathered.nearest > FROZEN_M ? 0 : dt, { simulate, hz });
    const crossItems = writeLines(rig, stringLines, gathered, tone);
    if (crosses.current) writeInstances(crosses.current, crossItems);
  });

  return (
    <>
      <primitive object={stringLines.lines} dispose={null} />
      <instancedMesh
        ref={crosses}
        args={[crossGeometry(), glow, MEMBER_CAPACITY]}
        frustumCulled={false}
        renderOrder={3}
      />
    </>
  );
}
