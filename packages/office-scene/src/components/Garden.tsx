import { useEffect, useMemo, useRef } from 'react';
import { useFrame, useThree, type ThreeEvent } from '@react-three/fiber';
import { gardenOf, type BloomInfo } from '../core/garden-geometry.js';
import { gardenMaterial, MAX_FLOWERS, pollenMaterial } from '../core/garden-material.js';
import type { Stalk } from '../core/stalk-types.js';
import { setUniform } from '../environment/uniforms.js';

const BLOOM_SECONDS = 3.2;
/** How far into a tier's rise (in tiers built) its flower starts to grow, so it never grows from a deck that is not there yet. */
const START = 0.6;
/** Metres of braid a merge flower waits beyond its commit's height before it opens, so it never opens ahead of its strand. */
const MERGE_LEAD = 0.5;

type GardenProps = {
  stalk: Stalk;
  animate: boolean;
  low: boolean;
  built: { current: number };
  /** The height the braid has climbed to, read every frame. */
  reach: { current: number };
  onBloom: (info: BloomInfo, event: ThreeEvent<PointerEvent | MouseEvent>) => void;
  onLeave: () => void;
};
type Garden = NonNullable<ReturnType<typeof gardenOf>>;

/** Opens each flower whose time has come (its tier has risen or the braid has passed its merge); the rest keep their bud. */
function openFlowers(
  opened: number[],
  garden: Garden | null,
  { animate, built, reach }: Pick<GardenProps, 'animate' | 'built' | 'reach'>,
  step: number,
) {
  const flowers = garden?.blooms.length ?? 0;
  for (let i = 0; i < MAX_FLOWERS; i++) {
    const waits = garden?.climb[i] ?? null;
    const ready =
      !animate ||
      (waits === null ? built.current > i + START : reach.current >= waits + MERGE_LEAD);
    const was = opened[i] ?? 0;
    opened[i] = i >= flowers ? 0 : ready ? Math.min(1, was + step) : was;
  }
}

/** The flowers' geometry and the two materials that draw it, each disposed when it is replaced or the garden goes. */
function useGardenParts(stalk: Stalk, low: boolean) {
  const garden = useMemo(() => gardenOf(stalk, low), [stalk, low]);
  const skin = useMemo(gardenMaterial, []);
  const dust = useMemo(pollenMaterial, []);
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
  return { garden, skin, dust };
}

/**
 * The flowers on the crown: one per tier and a great bloom on the spire, and a small one for each recent merge commit on the
 * braid, all in one mesh and one points object (two draw calls). Each flower opens from a bud once its tier has risen (`built`
 * is read every frame) or the braid has climbed past its merge commit (`reach`), in its own time, so one that arrives later
 * blooms later. With motion off or reduced every flower is simply open. Pointing at one names its species.
 */
export function Garden(props: GardenProps) {
  const { stalk, animate, low, onBloom, onLeave } = props;
  const { garden, skin, dust } = useGardenParts(stalk, low);
  const height = useThree((s) => s.size.height * s.viewport.dpr);
  const opened = useRef<number[]>(new Array<number>(MAX_FLOWERS).fill(animate ? 0 : 1));
  useFrame((state, delta) => {
    openFlowers(opened.current, garden, props, animate ? delta / BLOOM_SECONDS : 1);
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
