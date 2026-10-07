import { useEffect, useMemo, useRef } from 'react';
import { useFrame, useThree, type ThreeEvent } from '@react-three/fiber';
import { gardenOf, type BloomInfo } from './garden-geometry.js';
import { gardenMaterial, MAX_FLOWERS, pollenMaterial } from './garden-material.js';
import type { Stalk } from './stalk-types.js';
import { setUniform } from './uniforms.js';

const BLOOM_SECONDS = 3.2;
/** How far into a tier's rise (in tiers built) its flower starts to grow, so it never grows from a deck that is not there yet. */
const START = 0.6;
/** Metres of braid a merge flower waits beyond its commit's height before it opens, so it never opens ahead of its strand. */
const MERGE_LEAD = 0.5;

/**
 * The flowers on the crown: one per tier and a great bloom on the spire, and a small one for each recent merge commit on the
 * braid, all in one mesh and one points object (two draw calls). Each flower opens from a bud once its tier has risen (`built`
 * is read every frame) or the braid has climbed past its merge commit (`reach`), in its own time, so one that arrives later
 * blooms later. With motion off or reduced every flower is simply open. Pointing at one names its species.
 */
export function Garden({
  stalk,
  animate,
  low,
  built,
  reach,
  onBloom,
  onLeave,
}: {
  stalk: Stalk;
  animate: boolean;
  low: boolean;
  built: { current: number };
  /** The height the braid has climbed to, read every frame. */
  reach: { current: number };
  onBloom: (info: BloomInfo, event: ThreeEvent<PointerEvent | MouseEvent>) => void;
  onLeave: () => void;
}) {
  const garden = useMemo(() => gardenOf(stalk, low), [stalk, low]);
  const skin = useMemo(gardenMaterial, []);
  const dust = useMemo(pollenMaterial, []);
  const height = useThree((s) => s.size.height * s.viewport.dpr);
  const opened = useRef<number[]>(new Array<number>(MAX_FLOWERS).fill(animate ? 0 : 1));
  useEffect(
    () => () => {
      garden?.mesh.dispose();
      garden?.pollen?.dispose();
    },
    [garden],
  );
  useEffect(
    () => () => {
      skin.dispose();
      dust.dispose();
    },
    [skin, dust],
  );
  useFrame((state, delta) => {
    const flowers = garden?.blooms.length ?? 0;
    const step = animate ? delta / BLOOM_SECONDS : 1;
    for (let i = 0; i < MAX_FLOWERS; i++) {
      const waits = garden?.climb[i] ?? null;
      const ready =
        !animate ||
        (waits === null ? built.current > i + START : reach.current >= waits + MERGE_LEAD);
      const was = opened.current[i] ?? 0;
      opened.current[i] = i >= flowers ? 0 : ready ? Math.min(1, was + step) : was;
    }
    const time = animate ? state.clock.elapsedTime : 0;
    for (const material of [skin, dust]) {
      setUniform(material, 'time', time);
      setUniform(material, 'open', opened.current);
    }
    setUniform(dust, 'scale', height * 0.5 * (state.camera.projectionMatrix.elements[5] ?? 1));
  });
  if (!garden) return null;
  // Pointing at a flower, or tapping it on a touch screen, names it once it is open.
  const name = (event: ThreeEvent<PointerEvent | MouseEvent>) => {
    if (!event.face) return;
    const index = garden.mesh.getAttribute('pose').getZ(event.face.a);
    const bloom = garden.blooms[index];
    if (!bloom || (opened.current[index] ?? 0) < 0.5) return;
    event.stopPropagation();
    onBloom(bloom, event);
  };
  return (
    <>
      <mesh
        geometry={garden.mesh}
        material={skin}
        frustumCulled={false}
        renderOrder={2}
        onPointerMove={name}
        onClick={name}
        onPointerOut={onLeave}
      />
      {garden.pollen && (
        <points
          geometry={garden.pollen}
          material={dust}
          frustumCulled={false}
          renderOrder={2}
          raycast={() => null}
        />
      )}
    </>
  );
}
