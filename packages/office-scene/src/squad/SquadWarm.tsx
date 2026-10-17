import { useEffect, useLayoutEffect, useMemo, useRef } from 'react';
import { BufferGeometry, Float32BufferAttribute, type InstancedMesh } from 'three';
import type { Quality } from '../scene/scene-types.js';
import { createBeam, createDotMaterial } from './beam-shader.js';
import { sealGeometry, sealMaterial } from './handover/handover-art.js';
import { art, squadMaterials, withColors } from './squad-art.js';
import { createZoneDecal } from './zone-shader.js';

/**
 * The squad layer's shader programs, linked while the scene loads instead of when the first subagent shows up, so the
 * first appearance does not stall. Points are left out on the low tier.
 */
export function SquadWarm({ quality, zh }: { quality: Quality; zh: boolean }) {
  const parts = art();
  const { glow, solid } = squadMaterials();
  const glowMesh = useRef<InstancedMesh>(null);
  const solidMesh = useRef<InstancedMesh>(null);
  const beam = useMemo(createBeam, []);
  const decal = useMemo(createZoneDecal, []);
  const dots = useMemo(
    () => ({
      geometry: new BufferGeometry().setAttribute('position', new Float32BufferAttribute(3, 3)),
      material: createDotMaterial(),
    }),
    [],
  );
  useLayoutEffect(() => {
    withColors(glowMesh.current);
    withColors(solidMesh.current);
  }, []);
  useEffect(
    () => () => {
      for (const owned of [beam, decal, dots]) {
        owned.geometry.dispose();
        owned.material.dispose();
      }
    },
    [beam, decal, dots],
  );
  const full = quality !== 'low';
  return (
    <group visible={false}>
      <instancedMesh ref={glowMesh} args={[parts.ring, glow, 1]} visible={false} />
      <instancedMesh ref={solidMesh} args={[parts.stool, solid, 1]} visible={false} />
      <instancedMesh args={[beam.geometry, beam.material, 1]} visible={false} />
      <instancedMesh args={[decal.geometry, decal.material, 1]} visible={false} />
      <mesh args={[sealGeometry(), sealMaterial(zh, 'received')]} visible={false} />
      {full && <points args={[dots.geometry, dots.material]} visible={false} />}
    </group>
  );
}
