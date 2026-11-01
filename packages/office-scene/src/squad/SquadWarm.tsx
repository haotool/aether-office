import { useEffect, useLayoutEffect, useMemo, useRef } from 'react';
import type { InstancedMesh } from 'three';
import { sealGeometry, sealMaterial } from './handover/handover-art.js';
import { acquireSecondary } from '../screen/screen-secondary.js';
import { art, consoleMaterial, squadMaterials, withColors } from './squad-art.js';
import { CONSOLE } from './squad-console.js';
import { screenMaterial, screenRoleOf } from './squad-screens.js';
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
  const screenMesh = useRef<InstancedMesh>(null);
  const decal = useMemo(createZoneDecal, []);
  const probe = useMemo(() => {
    const screen = acquireSecondary('docs', CONSOLE.theme, CONSOLE.accent, CONSOLE.repaintMs);
    return { screen, material: consoleMaterial(screen.texture) };
  }, []);
  useLayoutEffect(() => {
    withColors(glowMesh.current);
    withColors(solidMesh.current);
    withColors(screenMesh.current);
  }, []);
  useEffect(
    () => () => {
      decal.geometry.dispose();
      decal.material.dispose();
      probe.material.dispose();
      probe.screen.release();
    },
    [decal, probe],
  );
  return (
    <group visible={false}>
      <instancedMesh ref={glowMesh} args={[parts.ring, glow, 1]} visible={false} />
      <instancedMesh ref={solidMesh} args={[parts.stool, solid, 1]} visible={false} />
      <instancedMesh
        ref={screenMesh}
        args={[parts.screen, screenMaterial(screenRoleOf('general-purpose')), 1]}
        visible={false}
      />
      <instancedMesh args={[decal.geometry, decal.material, 1]} visible={false} />
      <instancedMesh args={[parts.panel, probe.material, 1]} visible={false} />
      <mesh args={[sealGeometry(), sealMaterial(zh, 'received')]} visible={false} />
    </group>
  );
}
