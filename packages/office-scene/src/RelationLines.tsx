import { useEffect, useMemo } from 'react';
import { useFrame } from '@react-three/fiber';
import { AdditiveBlending, Color, type InstancedInterleavedBuffer } from 'three';
import { LineMaterial } from 'three/examples/jsm/lines/LineMaterial.js';
import { LineSegments2 } from 'three/examples/jsm/lines/LineSegments2.js';
import { LineSegmentsGeometry } from 'three/examples/jsm/lines/LineSegmentsGeometry.js';
import { distanceFade, type Edge } from './interplay.js';

// Threads (members of one repository, from the one in hand) are cyan; tethers (a session and its subagents) are violet.
const COLOR = { thread: new Color('#43e6df'), tether: new Color('#a592ff') } as const;
const BRIGHTNESS = { thread: 1, tether: 0.9 } as const;
const BREATH_HZ = 0.35;
/** Line width in CSS pixels (a plain GL line is one device pixel: invisible on a dense screen). */
const WIDTH = 1.8;

/**
 * Every edge in one fat-line object (one draw call), brightness set per frame by its strength, a slow breath and the
 * distance from the camera (additive blending, so dimmer means fainter). Rebuilt only when a position changes.
 */
export function RelationLines({ edges, animate }: { edges: readonly Edge[]; animate: boolean }) {
  // The edges are new objects on every render; the geometry is rebuilt only when a position changes.
  const shape = edges.map((e) => `${e.a}|${e.b}`).join(';');
  const { lines, material, geometry } = useMemo(() => {
    const geometry = new LineSegmentsGeometry();
    geometry.setPositions(edges.flatMap((e) => [...e.a, ...e.b]));
    geometry.setColors(new Array<number>(edges.length * 6).fill(0));
    const material = new LineMaterial({
      linewidth: WIDTH,
      vertexColors: true,
      transparent: true,
      blending: AdditiveBlending,
      depthWrite: false,
      toneMapped: false,
    });
    const lines = new LineSegments2(geometry, material);
    lines.frustumCulled = false;
    return { lines, material, geometry };
    // eslint-disable-next-line react-hooks/exhaustive-deps -- by value, see `shape`
  }, [shape]);
  useEffect(
    () => () => {
      geometry.dispose();
      material.dispose();
    },
    [geometry, material],
  );
  useFrame(({ camera, clock, size, gl }) => {
    const ratio = gl.getPixelRatio();
    material.resolution.set(size.width * ratio, size.height * ratio);
    material.linewidth = WIDTH * ratio;
    const start = geometry.getAttribute('instanceColorStart') as unknown as {
      data: InstancedInterleavedBuffer;
    };
    const array = start.data.array as Float32Array; // six floats per edge: start rgb, end rgb
    const breath = animate
      ? 0.75 + 0.25 * Math.sin(clock.elapsedTime * BREATH_HZ * Math.PI * 2)
      : 1;
    edges.forEach((e, i) => {
      const mx = (e.a[0] + e.b[0]) / 2;
      const my = (e.a[1] + e.b[1]) / 2;
      const mz = (e.a[2] + e.b[2]) / 2;
      const distance = Math.hypot(
        camera.position.x - mx,
        camera.position.y - my,
        camera.position.z - mz,
      );
      const k = BRIGHTNESS[e.kind] * e.strength * distanceFade(distance) * breath;
      const c = COLOR[e.kind];
      array.set([c.r * k, c.g * k, c.b * k, c.r * k, c.g * k, c.b * k], i * 6);
    });
    start.data.needsUpdate = true;
  });
  if (edges.length === 0) return null;
  return <primitive object={lines} dispose={null} />;
}
