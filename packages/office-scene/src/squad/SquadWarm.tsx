import { useEffect, useLayoutEffect, useMemo, useRef } from 'react';
import { BufferGeometry, Float32BufferAttribute, type InstancedMesh } from 'three';
import type { Quality } from '../scene/scene-types.js';
import { createBeam, createDotMaterial } from './beam-shader.js';
import { sealGeometry, sealMaterial } from './handover/handover-art.js';
import { createStringLines } from './puppet/string-lines.js';
import { art, squadMaterials, withColors } from './squad-art.js';
import { createZoneDecal } from './zone-shader.js';

/**
 * The squad layer's shader programs, linked while the scene loads instead of when the first subagent shows up: one hidden
 * copy of each kind of mesh the layer draws (the instanced glow and solid parts, the beam, the zone decal, the strings, the
 * drifting points, a seal), built from the layer's own factories so they compile to the very programs the layer will use.
 * `Warmup` compiles the whole scene, hidden objects included; nothing here is ever drawn. The strings and the points are
 * left out on the low tier, which never shows them.
 */
export function SquadWarm({ quality, zh }: { quality: Quality; zh: boolean }) {
  const parts = art();
  const { glow, solid } = squadMaterials();
  const glowMesh = useRef<InstancedMesh>(null);
  const solidMesh = useRef<InstancedMesh>(null);
  const beam = useMemo(createBeam, []);
  const decal = useMemo(createZoneDecal, []);
  const strings = useMemo(() => {
    const made = createStringLines();
    made.lines.visible = false; // a scene walk that counts the drawn strings must not count this copy
    return made;
  }, []);
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
      for (const owned of [beam, decal, strings, dots]) {
        owned.geometry.dispose();
        owned.material.dispose();
      }
    },
    [beam, decal, strings, dots],
  );
  const full = quality !== 'low';
  return (
    <group visible={false}>
      <instancedMesh ref={glowMesh} args={[parts.ring, glow, 1]} visible={false} />
      <instancedMesh ref={solidMesh} args={[parts.dressing, solid, 1]} visible={false} />
      <instancedMesh args={[beam.geometry, beam.material, 1]} visible={false} />
      <instancedMesh args={[decal.geometry, decal.material, 1]} visible={false} />
      <mesh args={[sealGeometry(), sealMaterial(zh, 'received')]} visible={false} />
      {full && <primitive object={strings.lines} dispose={null} />}
      {full && <points args={[dots.geometry, dots.material]} visible={false} />}
    </group>
  );
}
