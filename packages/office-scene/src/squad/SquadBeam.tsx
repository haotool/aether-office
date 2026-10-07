import { useEffect, useLayoutEffect, useMemo, useRef } from 'react';
import { useFrame, useThree } from '@react-three/fiber';
import {
  BufferGeometry,
  Color,
  Float32BufferAttribute,
  InstancedMesh,
  Points,
  Quaternion,
  Vector3,
} from 'three';
import { floorY } from '../scene-geometry.js';
import {
  BEAM_CAPACITY,
  BEAM_FROM_Y,
  BEAM_TO_Y,
  createBeam,
  createDotMaterial,
} from './beam-shader.js';
import {
  SUPERVISOR_GOLD,
  art,
  colorOf,
  finishInstances,
  squadMaterials,
  withColors,
  writeInstance,
} from './squad-art.js';
import type { DrawSquad } from './squad-draw.js';
import { beamIntensity, beamRate } from './beam-rate.js';
import type { SquadFrame } from './use-squad.js';

/** The brightness follows the squad's rate with this lag (a time constant, seconds): the halo glows a little after the work. */
const LAG_S = 0.6;
/** A beam with nobody in the squad burns at this level. */
const IDLE = 0.05;
/** Band speed (cycles per second) at the dimmest and the brightest. */
const SPEED = [0.2, 1.4] as const;
/** The halo hangs this far over the floor: over a seated head. */
const HALO_Y = 2.25;
const POINTS_PER_SQUAD = 48;
const UP = new Vector3(0, 1, 0);
// Scratch for the frame loop: nothing is allocated per frame.
const from = new Vector3();
const along = new Vector3();
const direction = new Vector3();
const turn = new Quaternion();
const NO_TURN = new Quaternion();
const shade = new Color();
const GOLD = new Color(SUPERVISOR_GOLD);
const spot: [number, number, number] = [0, 0, 0];
const stretch: [number, number, number] = [1, 1, 1];
const wide: [number, number, number] = [1, 1, 1];

/** How much of the extras each tier shows (none of them on low). */
export type BeamTier = { filament: boolean; halo: boolean; points: number };
export const beamTier = (quality: 'low' | 'balanced' | 'high'): BeamTier =>
  quality === 'high'
    ? { filament: true, halo: true, points: POINTS_PER_SQUAD }
    : quality === 'balanced'
      ? { filament: true, halo: true, points: POINTS_PER_SQUAD / 2 }
      : { filament: false, halo: false, points: 0 };

/**
 * The squad's beam into the core: a funnel of light from the zone (brightness and band speed follow the squad's tokens per
 * minute, or its tool calls per minute when no token rate is known: see beam-rate.ts), a thin filament and drifting points
 * from the core to the supervisor's halo, and the halo itself.
 * Squad, core, supervisor. Still (no band motion, no amber breathing, no points) when `animate` is off.
 */
export function SquadBeam({
  squads,
  frame,
  exploded,
  animate,
  tier,
}: {
  squads: readonly DrawSquad[];
  frame: SquadFrame;
  exploded: boolean;
  animate: boolean;
  tier: BeamTier;
}) {
  const invalidate = useThree((s) => s.invalidate);
  const beam = useMemo(() => createBeam(), []);
  const { glow } = squadMaterials();
  const parts = art();
  const funnel = useRef<InstancedMesh>(null);
  const filament = useRef<InstancedMesh>(null);
  const halo = useRef<InstancedMesh>(null);
  const dots = useRef<Points>(null);
  const lag = useRef(new Map<string, { level: number; phase: number }>());
  const dotPositions = useMemo(
    () => new Float32BufferAttribute(new Float32Array(BEAM_CAPACITY * POINTS_PER_SQUAD * 3), 3),
    [],
  );
  const dotGeometry = useMemo(
    () => new BufferGeometry().setAttribute('position', dotPositions),
    [dotPositions],
  );
  const dotMaterial = useMemo(createDotMaterial, []);
  useLayoutEffect(() => {
    withColors(filament.current);
    withColors(halo.current);
  }, []);
  useEffect(() => {
    invalidate();
  }, [squads, tier, invalidate]);

  useFrame(({ clock }, delta) => {
    if (!funnel.current || !filament.current || !halo.current || !dots.current) return;
    const now = Date.now();
    const time = clock.elapsedTime;
    const { members, zones } = frame.state.current;
    let settling = false;
    let filamentsChanged = false;
    let halosChanged = false;
    let dot = 0;
    const shown = Math.min(squads.length, BEAM_CAPACITY);
    for (let i = 0; i < shown; i++) {
      const s = squads[i]!;
      const y = floorY(s.floor, exploded);
      let working = false;
      let waiting = false;
      for (const id in members) {
        const m = members[id]!;
        if (m.supervisor !== s.supervisor || m.phase === 'leaving') continue;
        working = true;
        waiting ||= m.waiting;
      }
      const target = working
        ? Math.max(IDLE, beamIntensity(beamRate(zones[s.supervisor], now)))
        : IDLE;
      const entry = lag.current.get(s.supervisor) ?? { level: target, phase: 0 };
      entry.level += (target - entry.level) * (1 - Math.exp(-delta / LAG_S));
      if (Math.abs(target - entry.level) > 0.004) settling = true;
      else entry.level = target;
      if (animate) entry.phase += delta * (SPEED[0] + (SPEED[1] - SPEED[0]) * entry.level);
      lag.current.set(s.supervisor, entry);
      const tone = colorOf(s.accent);
      beam.start.setXYZ(i, s.x, y + BEAM_FROM_Y, s.z);
      beam.end.setXYZ(i, 0, y + BEAM_TO_Y, 0);
      beam.meta.setXYZW(
        i,
        0.42 * Math.min(s.width, s.depth),
        entry.level,
        waiting ? 1 : 0,
        entry.phase,
      );
      beam.tone.setXYZ(i, tone.r, tone.g, tone.b);
      // The return filament runs from the core to the supervisor's halo; the points drift along it.
      from.set(0, y + BEAM_TO_Y, 0);
      along.set(s.chairX, y + HALO_Y, s.chairZ).sub(from);
      const length = along.length();
      const brightness = 0.25 + 0.75 * entry.level;
      if (tier.filament) {
        spot[0] = from.x + along.x / 2;
        spot[1] = from.y + along.y / 2;
        spot[2] = from.z + along.z / 2;
        stretch[1] = length;
        shade.copy(tone).multiplyScalar(brightness);
        filamentsChanged =
          writeInstance(
            filament.current,
            i,
            spot,
            turn.setFromUnitVectors(UP, direction.copy(along).normalize()),
            stretch,
            shade,
          ) || filamentsChanged;
      }
      if (tier.halo) {
        const breathe = animate ? 1 + 0.04 * Math.sin(time * 2) : 1;
        spot[0] = s.chairX;
        spot[1] = y + HALO_Y;
        spot[2] = s.chairZ;
        wide[0] = wide[2] = breathe;
        shade.copy(GOLD).multiplyScalar(brightness);
        halosChanged = writeInstance(halo.current, i, spot, NO_TURN, wide, shade) || halosChanged;
      }
      const count = animate ? Math.round(tier.points * entry.level) : 0;
      for (let n = 0; n < count; n++) {
        const t = (n / POINTS_PER_SQUAD + time * 0.25 + i * 0.13) % 1;
        dotPositions.setXYZ(
          dot++,
          from.x + along.x * t + Math.sin(n * 2.4) * 0.05,
          from.y + along.y * t + Math.sin(t * Math.PI) * 0.35,
          from.z + along.z * t + Math.cos(n * 2.4) * 0.05,
        );
      }
    }
    funnel.current.count = shown;
    for (const a of [beam.start, beam.end, beam.meta, beam.tone]) a.needsUpdate = true;
    beam.material.uniforms['uPulse']!.value = animate
      ? 0.5 + 0.5 * Math.sin(time * Math.PI * 1.6)
      : 0.7;
    finishInstances(filament.current, tier.filament ? shown : 0, filamentsChanged);
    finishInstances(halo.current, tier.halo ? shown : 0, halosChanged);
    dotGeometry.setDrawRange(0, dot);
    dotPositions.needsUpdate = true;
    dots.current.visible = dot > 0;
    if (settling) invalidate();
  });

  return (
    <group>
      <instancedMesh
        ref={funnel}
        args={[beam.geometry, beam.material, BEAM_CAPACITY]}
        frustumCulled={false}
        renderOrder={3}
      />
      <instancedMesh
        ref={filament}
        args={[parts.filament, glow, BEAM_CAPACITY]}
        frustumCulled={false}
        renderOrder={3}
      />
      <instancedMesh
        ref={halo}
        args={[parts.halo, glow, BEAM_CAPACITY]}
        frustumCulled={false}
        renderOrder={3}
      />
      <points ref={dots} args={[dotGeometry, dotMaterial]} frustumCulled={false} renderOrder={3} />
    </group>
  );
}
