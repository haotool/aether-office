import { useEffect, useLayoutEffect, useMemo, useRef } from 'react';
import { useFrame, useThree } from '@react-three/fiber';
import { Color, InstancedMesh } from 'three';
import { floorY } from '../scene-geometry.js';
import type { DrawSquad } from './squad-draw.js';
import { art, squadMaterials, withColors, writeInstances, type Instance } from './squad-art.js';
import { Glide, type Point2 } from './squad-glide.js';
import { WAITING_AMBER } from './squad-art.js';
import { ZONE_CAPACITY, createZoneDecal } from './zone-shader.js';
import type { SquadFrame } from './use-squad.js';

const POD_CAPACITY = ZONE_CAPACITY * 12;
/** A zone grows or shrinks over about this long (a time constant of a quarter of it). */
const GLIDE_TAU = 0.25;
/** A pod unfolds (its stool and pane scale up) over this long after a member takes it. */
const UNFOLD_MS = 600;
const FLOOR_LIFT = 0.035; // over the floor, under the characters' feet

/**
 * The floor of the squads: each zone's dashed outline, a ring for every seat, and for a taken seat the hover stool and
 * its holo pane (or a silhouette past the character budget). Five instanced meshes, written when the frame changes or
 * something glides or unfolds. `podPos` is filled with where each sitter's pod is shown this frame.
 */
export function SquadZones({
  squads,
  frame,
  exploded,
  animate,
  podPos,
}: {
  squads: readonly DrawSquad[];
  frame: SquadFrame;
  exploded: boolean;
  /** Glide and unfold; off, a change is shown at once. */
  animate: boolean;
  podPos: Map<string, Point2>;
}) {
  const invalidate = useThree((s) => s.invalidate);
  const parts = art();
  const { glow } = squadMaterials();
  const decal = useMemo(() => createZoneDecal(), []);
  const glide = useMemo(() => new Glide(), []);
  const refs = {
    decal: useRef<InstancedMesh>(null),
    rings: useRef<InstancedMesh>(null),
    stools: useRef<InstancedMesh>(null),
    panes: useRef<InstancedMesh>(null),
    figures: useRef<InstancedMesh>(null),
  };
  const last = useRef({ squads, waiting: '' });
  const color = useMemo(() => new Color(), []);
  useLayoutEffect(() => {
    for (const mesh of [refs.rings, refs.stools, refs.panes, refs.figures])
      withColors(mesh.current);
  }, []); // eslint-disable-line react-hooks/exhaustive-deps -- the refs are stable
  useEffect(() => {
    last.current.waiting = '\0'; // a new set of squads: write on the next frame
    invalidate();
  }, [squads, invalidate]);

  useFrame((_, delta) => {
    const { decal: d, rings, stools, panes, figures } = refs;
    if (!d.current || !rings.current || !stools.current || !panes.current || !figures.current)
      return;
    const now = Date.now();
    const members = frame.state.current.members;
    const waiting = squads.flatMap((s) =>
      s.pods.filter((p) => p.member && members[p.member]?.waiting),
    ).length;
    const unfolding =
      animate && squads.some((s) => s.pods.some((p) => p.member && now - p.since < UNFOLD_MS));
    const fresh = last.current.waiting === '\0';
    if (!fresh && !glide.moving && !unfolding && last.current.waiting === String(waiting)) return;
    last.current.waiting = String(waiting);
    glide.begin();
    const tau = animate ? GLIDE_TAU : 0;
    const zones: Instance[] = [];
    const ringItems: Instance[] = [];
    const stoolItems: Instance[] = [];
    const paneItems: Instance[] = [];
    const figureItems: Instance[] = [];
    const keep = new Set<string>();
    podPos.clear();
    squads.forEach((s, i) => {
      const y = floorY(s.floor, exploded) + FLOOR_LIFT;
      const yaw = (s.deskRotation * Math.PI) / 2;
      const zone = glide.to(`z:${s.supervisor}`, { x: s.x, z: s.z }, delta, tau);
      const size = glide.to(`s:${s.supervisor}`, { x: s.width, z: s.depth }, delta, tau);
      keep.add(`z:${s.supervisor}`).add(`s:${s.supervisor}`);
      zones.push({ at: [zone.x, y, zone.z], color: s.accent });
      decal.size.setXY(i, size.x, size.z);
      const tone = color.set(s.accent);
      decal.tone.setXYZ(i, tone.r, tone.g, tone.b);
      decal.alpha.setX(i, 0.7);
      s.pods.forEach((pod, n) => {
        const key = `p:${s.supervisor}:${n}`;
        keep.add(key);
        const at = glide.to(key, { x: pod.x, z: pod.z }, delta, tau);
        const waits = !!pod.member && !!members[pod.member]?.waiting;
        ringItems.push({
          at: [at.x, y, at.z],
          color: waits ? WAITING_AMBER : pod.member ? s.accent : '#4b6a73',
          scale: pod.member ? [1, 1, 1] : [0.8, 1, 0.8],
        });
        if (!pod.member) return;
        podPos.set(pod.member, at);
        const age = animate ? Math.min(1, (now - pod.since) / UNFOLD_MS) : 1;
        const grow = age * age * (3 - 2 * age);
        const item = {
          at: [at.x, y, at.z] as const,
          yaw,
          scale: [grow, grow, grow] as const,
          color: waits ? WAITING_AMBER : s.accent,
        };
        if (pod.silhouette) figureItems.push({ ...item, color: '#7fa6b2' });
        else {
          stoolItems.push({ ...item, color: '#5f8f99' });
          paneItems.push(item);
        }
      });
    });
    glide.prune(keep);
    writeInstances(d.current, zones, false);
    writeInstances(rings.current, ringItems);
    writeInstances(stools.current, stoolItems);
    writeInstances(panes.current, paneItems);
    writeInstances(figures.current, figureItems);
    decal.size.needsUpdate = decal.tone.needsUpdate = decal.alpha.needsUpdate = true;
    if (glide.moving || unfolding) invalidate();
  });

  return (
    <group>
      <instancedMesh
        ref={refs.decal}
        args={[decal.geometry, decal.material, ZONE_CAPACITY]}
        frustumCulled={false}
        renderOrder={1}
      />
      <instancedMesh
        ref={refs.rings}
        args={[parts.ring, glow, POD_CAPACITY]}
        frustumCulled={false}
        renderOrder={2}
      />
      <instancedMesh
        ref={refs.stools}
        args={[parts.stool, glow, POD_CAPACITY]}
        frustumCulled={false}
        renderOrder={2}
      />
      <instancedMesh
        ref={refs.panes}
        args={[parts.pane, glow, POD_CAPACITY]}
        frustumCulled={false}
        renderOrder={2}
      />
      <instancedMesh
        ref={refs.figures}
        args={[parts.silhouette, glow, POD_CAPACITY]}
        frustumCulled={false}
        renderOrder={2}
      />
    </group>
  );
}
