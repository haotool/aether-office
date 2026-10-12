import { useLayoutEffect, useRef } from 'react';
import { useThree } from '@react-three/fiber';
import type { InstancedMesh } from 'three';
import { floorY } from '../scene/scene-geometry.js';
import type { DrawSquad } from './squad-draw.js';
import { art, squadMaterials, withColors, writeInstances } from './squad-art.js';
import { ZONE_CAPACITY } from './zone-shader.js';

/**
 * A supervisor's desk is dressed, not rebuilt: the floor's furniture is baked into one mesh, so what marks a desk as a
 * lead's (an in-tray, a stamp, a gold edge) is an overlay, one instanced mesh for every supervisor.
 */
export function SupervisorDesk({
  squads,
  exploded,
}: {
  squads: readonly DrawSquad[];
  exploded: boolean;
}) {
  const mesh = useRef<InstancedMesh>(null);
  const invalidate = useThree((s) => s.invalidate);
  useLayoutEffect(() => {
    if (!mesh.current) return;
    withColors(mesh.current);
    writeInstances(
      mesh.current,
      squads.map((s) => ({
        at: [s.deskX, floorY(s.floor, exploded), s.deskZ],
        yaw: (s.deskRotation * Math.PI) / 2,
        scale: [s.side === 1 ? -1 : 1, 1, 1],
        color: '#ffffff',
      })),
    );
    invalidate();
  }, [squads, exploded, invalidate]);
  return (
    <instancedMesh
      ref={mesh}
      args={[art().dressing, squadMaterials().solid, ZONE_CAPACITY]}
      frustumCulled={false}
    />
  );
}
