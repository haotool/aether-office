import { useEffect, useLayoutEffect, useMemo, useRef, type RefObject } from 'react';
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
import { floorY } from '../scene/scene-geometry.js';
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
import type { SquadMemberState, SquadZoneState } from './squad-model.js';
import { beamIntensity, beamRate } from './beam-rate.js';
import type { SquadFrame } from './use-squad.js';

const LAG_S = 0.6;
const IDLE = 0.05;
const SPEED = [0.2, 1.4] as const;
const HALO_Y = 2.25;
const POINTS_PER_SQUAD = 48;
const UP = new Vector3(0, 1, 0);
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

type BeamTier = { filament: boolean; halo: boolean; points: number };
export const beamTier = (quality: 'low' | 'balanced' | 'high'): BeamTier =>
  quality === 'high'
    ? { filament: true, halo: true, points: POINTS_PER_SQUAD }
    : quality === 'balanced'
      ? { filament: true, halo: true, points: POINTS_PER_SQUAD / 2 }
      : { filament: false, halo: false, points: 0 };

type Lag = { level: number; phase: number };
type Beam = ReturnType<typeof createBeam>;
const ON_DUTY = 1;
const WAITING = 2;

function dutyOf(members: Readonly<Record<string, SquadMemberState>>, supervisor: string): number {
  let duty = 0;
  for (const id in members) {
    const m = members[id];
    if (!m || m.supervisor !== supervisor || m.phase === 'leaving') continue;
    duty |= m.waiting ? ON_DUTY | WAITING : ON_DUTY;
  }
  return duty;
}

function approach(entry: Lag, target: number, delta: number, animate: boolean): boolean {
  entry.level += (target - entry.level) * (1 - Math.exp(-delta / LAG_S));
  const settling = Math.abs(target - entry.level) > 0.004;
  if (!settling) entry.level = target;
  if (animate) entry.phase += delta * (SPEED[0] + (SPEED[1] - SPEED[0]) * entry.level);
  return settling;
}

function writeFunnel(
  beam: Beam,
  i: number,
  s: DrawSquad,
  y: number,
  tone: Color,
  entry: Lag,
  waiting: boolean,
) {
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
}

function writeFilament(mesh: InstancedMesh, i: number, tone: Color, brightness: number): boolean {
  spot[0] = from.x + along.x / 2;
  spot[1] = from.y + along.y / 2;
  spot[2] = from.z + along.z / 2;
  stretch[1] = along.length();
  shade.copy(tone).multiplyScalar(brightness);
  return writeInstance(
    mesh,
    i,
    spot,
    turn.setFromUnitVectors(UP, direction.copy(along).normalize()),
    stretch,
    shade,
  );
}

function writeHalo(
  mesh: InstancedMesh,
  i: number,
  s: DrawSquad,
  y: number,
  brightness: number,
  breathe: number,
) {
  spot[0] = s.chairX;
  spot[1] = y + HALO_Y;
  spot[2] = s.chairZ;
  wide[0] = wide[2] = breathe;
  shade.copy(GOLD).multiplyScalar(brightness);
  return writeInstance(mesh, i, spot, NO_TURN, wide, shade);
}

function writeDots(
  positions: Float32BufferAttribute,
  first: number,
  count: number,
  i: number,
  time: number,
) {
  let dot = first;
  for (let n = 0; n < count; n++) {
    const t = (n / POINTS_PER_SQUAD + time * 0.25 + i * 0.13) % 1;
    positions.setXYZ(
      dot++,
      from.x + along.x * t + Math.sin(n * 2.4) * 0.05,
      from.y + along.y * t + Math.sin(t * Math.PI) * 0.35,
      from.z + along.z * t + Math.cos(n * 2.4) * 0.05,
    );
  }
  return dot;
}

type BeamProps = {
  squads: readonly DrawSquad[];
  frame: SquadFrame;
  exploded: boolean;
  animate: boolean;
  tier: BeamTier;
};

type BeamRig = {
  beam: Beam;
  funnel: RefObject<InstancedMesh | null>;
  filament: RefObject<InstancedMesh | null>;
  halo: RefObject<InstancedMesh | null>;
  dots: RefObject<Points | null>;
  lag: Map<string, Lag>;
  dotPositions: Float32BufferAttribute;
  dotGeometry: BufferGeometry;
};

function useBeamRig(): BeamRig {
  const beam = useMemo(() => createBeam(), []);
  const funnel = useRef<InstancedMesh>(null);
  const filament = useRef<InstancedMesh>(null);
  const halo = useRef<InstancedMesh>(null);
  const dots = useRef<Points>(null);
  const lag = useRef(new Map<string, Lag>()).current;
  const dotPositions = useMemo(
    () => new Float32BufferAttribute(new Float32Array(BEAM_CAPACITY * POINTS_PER_SQUAD * 3), 3),
    [],
  );
  const dotGeometry = useMemo(
    () => new BufferGeometry().setAttribute('position', dotPositions),
    [dotPositions],
  );
  return useMemo(
    () => ({ beam, funnel, filament, halo, dots, lag, dotPositions, dotGeometry }),
    [beam, funnel, filament, halo, dots, lag, dotPositions, dotGeometry],
  );
}

const targetLevel = (duty: number, zone: SquadZoneState | undefined, now: number) =>
  duty ? Math.max(IDLE, beamIntensity(beamRate(zone, now))) : IDLE;
const breathing = (animate: boolean, time: number) => (animate ? 1 + 0.04 * Math.sin(time * 2) : 1);
const pointsFor = (animate: boolean, tier: BeamProps['tier'], level: number) =>
  animate ? Math.round(tier.points * level) : 0;

function updateBeams(rig: BeamRig, p: BeamProps, time: number, delta: number): boolean {
  const { beam, funnel, filament, halo, dots, lag, dotPositions, dotGeometry } = rig;
  const { squads, exploded, animate, tier } = p;
  if (!funnel.current || !filament.current || !halo.current || !dots.current) return false;
  const now = Date.now();
  const { members, zones } = p.frame.state.current;
  let settling = false;
  let filamentsChanged = false;
  let halosChanged = false;
  let dot = 0;
  const shown = Math.min(squads.length, BEAM_CAPACITY);
  for (let i = 0; i < shown; i++) {
    const s = squads[i];
    if (!s) break;
    const y = floorY(s.floor, exploded);
    const duty = dutyOf(members, s.supervisor);
    const target = targetLevel(duty, zones[s.supervisor], now);
    const entry = lag.get(s.supervisor) ?? { level: target, phase: 0 };
    settling = approach(entry, target, delta, animate) || settling;
    lag.set(s.supervisor, entry);
    const tone = colorOf(s.accent);
    writeFunnel(beam, i, s, y, tone, entry, (duty & WAITING) !== 0);
    from.set(0, y + BEAM_TO_Y, 0);
    along.set(s.chairX, y + HALO_Y, s.chairZ).sub(from);
    const brightness = 0.25 + 0.75 * entry.level;
    if (tier.filament)
      filamentsChanged = writeFilament(filament.current, i, tone, brightness) || filamentsChanged;
    if (tier.halo)
      halosChanged =
        writeHalo(halo.current, i, s, y, brightness, breathing(animate, time)) || halosChanged;
    dot = writeDots(dotPositions, dot, pointsFor(animate, tier, entry.level), i, time);
  }
  funnel.current.count = shown;
  for (const a of [beam.start, beam.end, beam.meta, beam.tone]) a.needsUpdate = true;
  const pulse = beam.material.uniforms['uPulse'];
  if (pulse) pulse.value = animate ? 0.5 + 0.5 * Math.sin(time * Math.PI * 1.6) : 0.7;
  finishInstances(filament.current, tier.filament ? shown : 0, filamentsChanged);
  finishInstances(halo.current, tier.halo ? shown : 0, halosChanged);
  dotGeometry.setDrawRange(0, dot);
  dotPositions.needsUpdate = true;
  dots.current.visible = dot > 0;
  return settling;
}

export function SquadBeam(props: BeamProps) {
  const { squads, tier } = props;
  const invalidate = useThree((s) => s.invalidate);
  const rig = useBeamRig();
  const { glow } = squadMaterials();
  const parts = art();
  const dotMaterial = useMemo(createDotMaterial, []);
  useLayoutEffect(() => {
    withColors(rig.filament.current);
    withColors(rig.halo.current);
  }, [rig]);
  useEffect(() => {
    invalidate();
  }, [squads, tier, invalidate]);
  useFrame(({ clock }, delta) => {
    if (updateBeams(rig, props, clock.elapsedTime, delta)) invalidate();
  });

  return (
    <group>
      <instancedMesh
        ref={rig.funnel}
        args={[rig.beam.geometry, rig.beam.material, BEAM_CAPACITY]}
        frustumCulled={false}
        renderOrder={3}
      />
      <instancedMesh
        ref={rig.filament}
        args={[parts.filament, glow, BEAM_CAPACITY]}
        frustumCulled={false}
        renderOrder={3}
      />
      <instancedMesh
        ref={rig.halo}
        args={[parts.halo, glow, BEAM_CAPACITY]}
        frustumCulled={false}
        renderOrder={3}
      />
      <points
        ref={rig.dots}
        args={[rig.dotGeometry, dotMaterial]}
        frustumCulled={false}
        renderOrder={3}
      />
    </group>
  );
}
