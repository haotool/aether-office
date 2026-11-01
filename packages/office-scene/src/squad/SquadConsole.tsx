import { useEffect, useLayoutEffect, useMemo, useRef } from 'react';
import { useFrame, useThree } from '@react-three/fiber';
import type { InstancedMesh } from 'three';
import { acquireSecondary } from '../screen/screen-secondary.js';
import { floorY } from '../scene/scene-geometry.js';
import { art, consoleMaterial, writeInstances } from './squad-art.js';
import { CONSOLE, CONSOLE_KINDS, panelsOf } from './squad-console.js';
import type { DrawSquad } from './squad-draw.js';
import { ZONE_CAPACITY } from './zone-shader.js';

type ConsoleProps = { squads: readonly DrawSquad[]; exploded: boolean; animate: boolean };

export function SquadConsole({ squads, exploded, animate }: ConsoleProps) {
  const invalidate = useThree((s) => s.invalidate);
  const meshes = useRef<Record<string, InstancedMesh | null>>({});
  const screens = useMemo(
    () =>
      CONSOLE_KINDS.map((kind) => {
        const screen = acquireSecondary(kind, CONSOLE.theme, CONSOLE.accent, CONSOLE.repaintMs);
        return { kind, screen, material: consoleMaterial(screen.texture) };
      }),
    [],
  );
  useEffect(
    () => () => {
      for (const { screen, material } of screens) {
        material.dispose();
        screen.release();
      }
    },
    [screens],
  );
  useLayoutEffect(() => {
    const panels = squads.flatMap((s) => {
      const y = floorY(s.floor, exploded);
      return panelsOf(s).map((panel) => ({ ...panel, y: panel.y + y }));
    });
    for (const { kind } of screens) {
      const mesh = meshes.current[kind];
      if (!mesh) continue;
      const own = panels.filter((panel) => panel.kind === kind);
      writeInstances(
        mesh,
        own.map(({ x, y, z, yaw, width }) => ({
          at: [x, y, z],
          yaw,
          scale: [width, width, 1],
          color: '#ffffff',
        })),
        false,
      );
    }
    invalidate();
  }, [squads, exploded, screens, invalidate]);
  useFrame(() => {
    const now = Date.now();
    let painted = false;
    for (const { screen } of screens) painted = screen.paint(now, animate) || painted;
    if (painted) invalidate();
  });
  return (
    <>
      {screens.map(({ kind, material }) => (
        <instancedMesh
          key={kind}
          name={`squad-console-${kind}`}
          ref={(node) => {
            meshes.current[kind] = node;
          }}
          args={[art().panel, material, ZONE_CAPACITY]}
          frustumCulled={false}
          renderOrder={3}
        />
      ))}
    </>
  );
}
