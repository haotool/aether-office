import { useEffect, useLayoutEffect, useMemo, useRef, type RefObject } from 'react';
import { useFrame, useThree } from '@react-three/fiber';
import { Color, InstancedMesh } from 'three';
import { floorY } from '../scene/scene-geometry.js';
import type { DrawSquad } from './squad-draw.js';
import type { SquadMemberState } from './squad-model.js';
import { art, squadMaterials, withColors, writeInstances, type Instance } from './squad-art.js';
import { Glide, type Point2 } from './squad-glide.js';
import { WAITING_AMBER } from './squad-art.js';
import { ZONE_CAPACITY, createZoneDecal } from './zone-shader.js';
import type { SquadFrame } from './use-squad.js';

const POD_CAPACITY = ZONE_CAPACITY * 12;
const GLIDE_TAU = 0.25;
const UNFOLD_MS = 600;
const FLOOR_LIFT = 0.035;

type Decal = ReturnType<typeof createZoneDecal>;
type Members = Readonly<Record<string, SquadMemberState>>;
type Pod = DrawSquad['pods'][number];

type Items = {
  zones: Instance[];
  rings: Instance[];
  stools: Instance[];
  panes: Instance[];
  figures: Instance[];
};

type Write = {
  glide: Glide;
  decal: Decal;
  color: Color;
  members: Members;
  podPos: Map<string, Point2>;
  keep: Set<string>;
  items: Items;
  exploded: boolean;
  animate: boolean;
  delta: number;
  now: number;
};

function placePod(w: Write, s: DrawSquad, pod: Pod, n: number, y: number, yaw: number) {
  const tau = w.animate ? GLIDE_TAU : 0;
  const key = `p:${s.supervisor}:${n}`;
  w.keep.add(key);
  const at = w.glide.to(key, { x: pod.x, z: pod.z }, w.delta, tau);
  const waits = !!pod.member && !!w.members[pod.member]?.waiting;
  w.items.rings.push({
    at: [at.x, y, at.z],
    color: waits ? WAITING_AMBER : pod.member ? s.accent : '#4b6a73',
    scale: pod.member ? [1, 1, 1] : [0.8, 1, 0.8],
  });
  if (!pod.member) return;
  w.podPos.set(pod.member, at);
  const age = w.animate ? Math.min(1, (w.now - pod.since) / UNFOLD_MS) : 1;
  const grow = age * age * (3 - 2 * age);
  const item = {
    at: [at.x, y, at.z] as const,
    yaw,
    scale: [grow, grow, grow] as const,
    color: waits ? WAITING_AMBER : s.accent,
  };
  if (pod.silhouette) w.items.figures.push({ ...item, color: '#7fa6b2' });
  else {
    w.items.stools.push({ ...item, color: '#5f8f99' });
    w.items.panes.push(item);
  }
}

function placeSquad(w: Write, s: DrawSquad, i: number) {
  const tau = w.animate ? GLIDE_TAU : 0;
  const y = floorY(s.floor, w.exploded) + FLOOR_LIFT;
  const zone = w.glide.to(`z:${s.supervisor}`, { x: s.x, z: s.z }, w.delta, tau);
  const size = w.glide.to(`s:${s.supervisor}`, { x: s.width, z: s.depth }, w.delta, tau);
  w.keep.add(`z:${s.supervisor}`).add(`s:${s.supervisor}`);
  w.items.zones.push({ at: [zone.x, y, zone.z], color: s.accent });
  w.decal.size.setXY(i, size.x, size.z);
  const tone = w.color.set(s.accent);
  w.decal.tone.setXYZ(i, tone.r, tone.g, tone.b);
  w.decal.alpha.setX(i, 0.7);
  const yaw = (s.podRotation * Math.PI) / 2;
  s.pods.forEach((pod, n) => placePod(w, s, pod, n, y, yaw));
}

type ZoneProps = {
  squads: readonly DrawSquad[];
  frame: SquadFrame;
  exploded: boolean;
  animate: boolean;
  podPos: Map<string, Point2>;
};

type ZoneRig = {
  decal: Decal;
  glide: Glide;
  color: Color;
  last: { squads: readonly DrawSquad[]; waiting: string };
  meshes: Record<
    'decal' | 'rings' | 'stools' | 'panes' | 'figures',
    RefObject<InstancedMesh | null>
  >;
};

function useZoneRig(squads: readonly DrawSquad[]): ZoneRig {
  const decal = useMemo(() => createZoneDecal(), []);
  const glide = useMemo(() => new Glide(), []);
  const color = useMemo(() => new Color(), []);
  const last = useRef({ squads, waiting: '' }).current;
  const decalMesh = useRef<InstancedMesh>(null);
  const rings = useRef<InstancedMesh>(null);
  const stools = useRef<InstancedMesh>(null);
  const panes = useRef<InstancedMesh>(null);
  const figures = useRef<InstancedMesh>(null);
  return useMemo(
    () => ({
      decal,
      glide,
      color,
      last,
      meshes: { decal: decalMesh, rings, stools, panes, figures },
    }),
    [decal, glide, color, last, decalMesh, rings, stools, panes, figures],
  );
}

function updateFloor(rig: ZoneRig, p: ZoneProps, delta: number): boolean {
  const { decal, glide, color, last, meshes } = rig;
  const { squads, exploded, animate, podPos } = p;
  const { decal: decalMesh, rings, stools, panes, figures } = meshes;
  if (!decalMesh.current || !rings.current || !stools.current || !panes.current || !figures.current)
    return false;
  const now = Date.now();
  const members = p.frame.state.current.members;
  const waiting = squads.flatMap((s) =>
    s.pods.filter((pod) => pod.member && members[pod.member]?.waiting),
  ).length;
  const unfolding =
    animate && squads.some((s) => s.pods.some((pod) => pod.member && now - pod.since < UNFOLD_MS));
  const fresh = last.waiting === '\0';
  if (!fresh && !glide.moving && !unfolding && last.waiting === String(waiting)) return false;
  last.waiting = String(waiting);
  glide.begin();
  const items: Items = { zones: [], rings: [], stools: [], panes: [], figures: [] };
  const keep = new Set<string>();
  podPos.clear();
  const w: Write = {
    glide,
    decal,
    color,
    members,
    podPos,
    keep,
    items,
    exploded,
    animate,
    delta,
    now,
  };
  squads.forEach((s, i) => placeSquad(w, s, i));
  glide.prune(keep);
  writeInstances(decalMesh.current, items.zones, false);
  writeInstances(rings.current, items.rings);
  writeInstances(stools.current, items.stools);
  writeInstances(panes.current, items.panes);
  writeInstances(figures.current, items.figures);
  decal.size.needsUpdate = decal.tone.needsUpdate = decal.alpha.needsUpdate = true;
  return glide.moving || unfolding;
}

export function SquadZones(props: ZoneProps) {
  const { squads } = props;
  const invalidate = useThree((s) => s.invalidate);
  const parts = art();
  const { glow, solid } = squadMaterials();
  const rig = useZoneRig(squads);
  const { decal, last, meshes } = rig;
  const pods = [
    ['rings', parts.ring],
    ['stools', parts.stool],
    ['panes', parts.pane],
    ['figures', parts.silhouette],
  ] as const;
  useLayoutEffect(() => {
    for (const mesh of [meshes.rings, meshes.stools, meshes.panes, meshes.figures])
      withColors(mesh.current);
  }, [meshes]);
  useEffect(() => {
    last.waiting = '\0';
    invalidate();
  }, [squads, last, invalidate]);
  useFrame((_, delta) => {
    if (updateFloor(rig, props, delta)) invalidate();
  });

  return (
    <group>
      <instancedMesh
        ref={meshes.decal}
        args={[decal.geometry, decal.material, ZONE_CAPACITY]}
        frustumCulled={false}
        renderOrder={1}
      />
      {pods.map(([name, geometry]) => (
        <instancedMesh
          key={name}
          name={`squad-${name}`}
          ref={meshes[name]}
          args={[geometry, name === 'rings' ? glow : solid, POD_CAPACITY]}
          frustumCulled={false}
        />
      ))}
    </group>
  );
}
