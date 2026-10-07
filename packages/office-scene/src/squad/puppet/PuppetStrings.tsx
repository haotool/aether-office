import { useEffect, useLayoutEffect, useMemo, useRef } from 'react';
import { useFrame, useThree } from '@react-three/fiber';
import { Color, Vector3, type InstancedInterleavedBuffer, type InstancedMesh } from 'three';
import { distanceFade } from '../../interplay.js';
import { floorY } from '../../scene-geometry.js';
import type { Quality } from '../../scene-types.js';
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

/**
 * Puppet strings: light strings from a control cross over each live subagent to its head and two hands, and a master
 * thread from the cross to the supervisor. Every string of the scene is one `LineSegments2` (one draw) plus one instanced
 * mesh for the crosses. The strings follow the subagent and never pull it. `simulate` off (reduced motion, Calm) draws
 * straight, still lines; the layer is not mounted at all on the low tier or when the person turned the strings off.
 */
export function PuppetStrings({
  squads,
  frame,
  exploded,
  simulate,
  quality,
  podPos,
}: {
  squads: readonly DrawSquad[];
  frame: SquadFrame;
  exploded: boolean;
  simulate: boolean;
  quality: Quality;
  podPos: ReadonlyMap<string, Point2>;
}) {
  const invalidate = useThree((s) => s.invalidate);
  const rig = useMemo(() => createRig(), []);
  const { glow } = squadMaterials();
  const crosses = useRef<InstancedMesh>(null);
  const colors = useMemo(() => new Map<string, Color>(), []);
  const probe = useMemo(() => new Vector3(), []);
  const seatOf = useMemo(() => new Map(frame.seats.map((s) => [s.member, s])), [frame.seats]);
  const squadOf = useMemo(() => new Map(squads.map((s) => [s.supervisor, s])), [squads]);
  const { lines, material, geometry } = useMemo(createStringLines, []);
  useEffect(
    () => () => {
      geometry.dispose();
      material.dispose();
    },
    [geometry, material],
  );
  useLayoutEffect(() => withColors(crosses.current), []);
  useEffect(() => invalidate(), [squads, simulate, quality, invalidate]);
  const tone = (hex: string) => {
    const known = colors.get(hex) ?? new Color(hex);
    colors.set(hex, known);
    return known;
  };

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
    const ratio = gl.getPixelRatio();
    material.resolution.set(size.width * ratio, size.height * ratio);
    material.linewidth = STRING_WIDTH * ratio;
    const members: RigMember[] = [];
    const squadOfMember: DrawSquad[] = [];
    const distances: number[] = [];
    let nearest = Infinity;
    for (const m of Object.values(frame.state.current.members)) {
      const seat = seatOf.get(m.id);
      const squad = squadOf.get(m.supervisor);
      if (!seat || !squad || m.phase === 'arriving') continue;
      const at = podPos.get(m.id) ?? seat;
      const y = floorY(seat.floor, exploded);
      squadOfMember.push(squad);
      distances.push(camera.position.distanceTo(probe.set(at.x, y + 1.5, at.z)));
      nearest = Math.min(nearest, distances[distances.length - 1]!);
      members.push({
        id: m.id,
        phase: phaseOf(m),
        toolAt: m.toolAt,
        sockets: anchorsOf(m.id),
        chair: { x: at.x, z: at.z, yaw: (seat.rotation * Math.PI) / 2, y },
        master: [squad.chairX, y + MASTER_Y, squad.chairZ],
      });
    }
    // The nearest subagent sets the pace: far from the camera the simulation slows, and then holds.
    const hz = nearest > FAR_M ? FAR_HZ : HZ[quality] || FAR_HZ;
    pace.current.hz = hz;
    updateRig(rig, members, nearest > FROZEN_M ? 0 : dt, { simulate, hz });

    const start = geometry.getAttribute('instanceStart') as unknown as {
      data: InstancedInterleavedBuffer;
    };
    const colorStart = geometry.getAttribute('instanceColorStart') as unknown as {
      data: InstancedInterleavedBuffer;
    };
    const positions = start.data.array as Float32Array;
    const rgb = colorStart.data.array as Float32Array;
    const crossItems: Instance[] = [];
    let segment = 0;
    for (let i = 0; i < members.length; i++) {
      const m = members[i]!;
      const slot = rig.slots.get(m.id);
      const motion = rig.motions.get(m.id);
      const squad = squadOfMember[i]!;
      if (slot === undefined || !motion) continue;
      const light = motion.alpha * distanceFade(distances[i]!);
      if (light <= 0.01) continue;
      const hue = tone(m.phase === 'waiting' ? WAITING_AMBER : squad.accent);
      const first = slot * STRINGS_PER_MEMBER * POINTS * 3;
      for (let k = 0; k < STRINGS_PER_MEMBER; k++) {
        const base = first + k * POINTS * 3;
        const weight = k === STRINGS_PER_MEMBER - 1 ? MASTER_LIGHT : 1;
        for (let p = 0; p < SEGMENTS; p++) {
          const o = segment * 6;
          for (let n = 0; n < 6; n++) positions[o + n] = rig.strings.pos[base + p * 3 + n]!;
          const a = light * weight * (1 - (1 - BODY_LIGHT) * (p / SEGMENTS));
          const b = light * weight * (1 - (1 - BODY_LIGHT) * ((p + 1) / SEGMENTS));
          rgb[o] = hue.r * a;
          rgb[o + 1] = hue.g * a;
          rgb[o + 2] = hue.b * a;
          rgb[o + 3] = hue.r * b;
          rgb[o + 4] = hue.g * b;
          rgb[o + 5] = hue.b * b;
          segment++;
        }
      }
      crossItems.push({
        at: [rig.strings.pos[first]!, rig.strings.pos[first + 1]!, rig.strings.pos[first + 2]!],
        yaw: m.chair.yaw,
        color: hue.clone().multiplyScalar(0.35 + 0.65 * light),
      });
    }
    geometry.instanceCount = segment;
    start.data.needsUpdate = true;
    colorStart.data.needsUpdate = true;
    lines.visible = segment > 0;
    if (crosses.current) writeInstances(crosses.current, crossItems);
  });

  return (
    <>
      <primitive object={lines} dispose={null} />
      <instancedMesh
        ref={crosses}
        args={[crossGeometry(), glow, MEMBER_CAPACITY]}
        frustumCulled={false}
        renderOrder={3}
      />
    </>
  );
}
