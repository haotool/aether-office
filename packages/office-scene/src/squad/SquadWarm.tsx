import { useEffect, useLayoutEffect, useMemo, useRef } from 'react';
import type { InstancedMesh } from 'three';
import { sealGeometry, sealMaterial } from './handover/handover-art.js';
import { art, squadMaterials, withColors } from './squad-art.js';
import { createZoneDecal } from './zone-shader.js';

/**
 * The squad layer's shader programs, linked while the scene loads instead of when the first subagent shows up, so the
 * first appearance does not stall.
 */
export function SquadWarm({ zh }: { zh: boolean }) {
  const parts = art();
  const { glow, solid } = squadMaterials();
  const glowMesh = useRef<InstancedMesh>(null);
  const solidMesh = useRef<InstancedMesh>(null);
  const decal = useMemo(createZoneDecal, []);
  useLayoutEffect(() => {
    withColors(glowMesh.current);
    withColors(solidMesh.current);
  }, []);
  useEffect(
    () => () => {
      decal.geometry.dispose();
      decal.material.dispose();
    },
    [decal],
  );
  return (
    <group visible={false}>
      <instancedMesh ref={glowMesh} args={[parts.ring, glow, 1]} visible={false} />
      <instancedMesh ref={solidMesh} args={[parts.stool, solid, 1]} visible={false} />
      <instancedMesh args={[decal.geometry, decal.material, 1]} visible={false} />
      <mesh args={[sealGeometry(), sealMaterial(zh, 'received')]} visible={false} />
    </group>
  );
}
