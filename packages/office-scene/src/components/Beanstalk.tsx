import { useCallback, useEffect, useLayoutEffect, useMemo, useRef, type RefObject } from 'react';
import { useFrame, useThree, type ThreeEvent } from '@react-three/fiber';
import { IcosahedronGeometry, MeshBasicMaterial, Vector3 } from 'three';
import type { InstancedMesh, ShaderMaterial } from 'three';
import { Clouds } from '../environment/Clouds.js';
import { Garden } from './Garden.js';
import type { BloomInfo } from '../core/garden-geometry.js';
import { paletteAt, type Stalk, type StalkNode } from '../core/stalk-layout.js';
import { beadRadii, paintBeads, placeBeads } from '../core/stalk-beads.js';
import { stalkMaterial, stalkTubes } from '../core/stalk-materials.js';
import { setUniform } from '../environment/uniforms.js';

export type StalkHover =
  | (({ node: StalkNode } | { bloom: BloomInfo }) & {
      x: number;
      y: number;
      flip: boolean;
    })
  | null;

const GROW_SECONDS = 2.4;
const TIER_SECONDS = 0.4;
const CLOUD_SECONDS = 1.5;
const HOVER_MS = 40;
const TOUCH_TIP_MS = 4000;
const scratch = new Vector3();

function advanceAfterGrowth(
  built: { current: number },
  gathered: { current: number },
  tiers: number,
  delta: number,
) {
  if (built.current < tiers) built.current = Math.min(tiers, built.current + delta / TIER_SECONDS);
  else gathered.current = Math.min(1, gathered.current + delta / CLOUD_SECONDS);
}

function useStalkBuild(
  stalk: Stalk,
  animate: boolean,
  skin: ShaderMaterial,
  nodesMesh: RefObject<InstancedMesh | null>,
  radii: readonly number[],
) {
  const grown = useRef(animate ? 0 : 1);
  const built = useRef(animate ? 0 : stalk.tiers.length + 1);
  const gathered = useRef(animate ? 0 : 1);
  const clock = useRef(0);
  const reached = useRef(0);
  const reach = useCallback(() => {
    const eased = 1 - (1 - grown.current) ** 3;
    return grown.current >= 1 ? stalk.top + 1 : -3 + eased * (stalk.top + 4);
  }, [stalk]);
  const place = useCallback(
    (to: number) => {
      if (nodesMesh.current) placeBeads(nodesMesh.current, stalk, radii, to);
    },
    [nodesMesh, stalk, radii],
  );
  useLayoutEffect(() => {
    if (!nodesMesh.current) return;
    paintBeads(nodesMesh.current, stalk);
    place(reach());
  }, [nodesMesh, stalk, place, reach]);
  useFrame((_state, delta) => {
    clock.current += animate ? delta : 0;
    setUniform(skin, 'time', animate ? clock.current : 3);
    setUniform(skin, 'energy', stalk.energy);
    if (animate) {
      if (grown.current < 1) {
        grown.current = Math.min(1, grown.current + delta / GROW_SECONDS);
        place(reach());
      } else advanceAfterGrowth(built, gathered, stalk.tiers.length + 1, delta);
    } else {
      grown.current = 1;
      built.current = stalk.tiers.length + 1;
      gathered.current = 1;
    }
    reached.current = reach();
    setUniform(skin, 'grow', reached.current);
  });
  return { built, gathered, reached };
}

type Target = { node: StalkNode } | { bloom: BloomInfo };

function useStalkHover(onHover: (hover: StalkHover) => void) {
  const size = useThree((s) => s.size);
  const last = useRef(0);
  const dismiss = useRef<ReturnType<typeof setTimeout>>(undefined);
  useEffect(() => () => clearTimeout(dismiss.current), []);
  const report = (target: Target | undefined, event: ThreeEvent<PointerEvent | MouseEvent>) => {
    const now = performance.now();
    if (!target || now - last.current < HOVER_MS) return;
    last.current = now;
    const { offsetX: x, offsetY: y } = event.nativeEvent;
    onHover({ ...target, x, y, flip: x > size.width * 0.5 });
    // A finger never "leaves" what it tapped, so the card goes by itself.
    clearTimeout(dismiss.current);
    if ('pointerType' in event.nativeEvent && event.nativeEvent.pointerType === 'touch')
      dismiss.current = setTimeout(() => onHover(null), TOUCH_TIP_MS);
  };
  return { report, leave: () => onHover(null) };
}

function beadAt(stalk: Stalk, id: number | undefined): Target | undefined {
  const node = stalk.nodes[id ?? -1];
  return node && { node };
}

function nearestBead(stalk: Stalk, point: Vector3): Target | undefined {
  let best: StalkNode | undefined;
  let distance = Infinity;
  for (const n of stalk.nodes) {
    const d = point.distanceToSquared(scratch.set(n.position[0], n.position[1], n.position[2]));
    if (d < distance) [best, distance] = [n, d];
  }
  return best && { node: best };
}

type BeanstalkProps = {
  stalk: Stalk;
  animate: boolean;
  low: boolean;
  onHover: (hover: StalkHover) => void;
};

function useStalkParts(stalk: Stalk, low: boolean) {
  const tubes = useMemo(() => stalkTubes(stalk, low), [stalk, low]);
  const skin = useMemo(() => stalkMaterial(), []);
  const bead = useMemo(() => new IcosahedronGeometry(1, 0), []);
  const glow = useMemo(() => new MeshBasicMaterial({ toneMapped: false }), []);
  useEffect(() => () => tubes?.dispose(), [tubes]);
  useEffect(
    () => () => {
      skin.dispose();
      bead.dispose();
      glow.dispose();
    },
    [skin, bead, glow],
  );
  const radii = useMemo(() => beadRadii(stalk), [stalk]);
  return { tubes, skin, bead, glow, radii };
}

export function Beanstalk({ stalk, animate, low, onHover }: BeanstalkProps) {
  const nodesMesh = useRef<InstancedMesh>(null);
  const { tubes, skin, bead, glow, radii } = useStalkParts(stalk, low);
  const { built, gathered, reached } = useStalkBuild(stalk, animate, skin, nodesMesh, radii);
  const { report, leave } = useStalkHover(onHover);

  return (
    <group>
      {tubes && (
        <mesh
          geometry={tubes}
          material={skin}
          frustumCulled={false}
          onPointerMove={(e) => report(nearestBead(stalk, e.point), e)}
          onClick={(e) => report(nearestBead(stalk, e.point), e)}
          onPointerOut={leave}
        />
      )}
      <instancedMesh
        key={stalk.nodes.length}
        ref={nodesMesh}
        args={[bead, glow, stalk.nodes.length]}
        frustumCulled={false}
        onPointerMove={(e) => report(beadAt(stalk, e.instanceId), e)}
        onClick={(e) => report(beadAt(stalk, e.instanceId), e)}
        onPointerOut={leave}
      />
      <Garden
        stalk={stalk}
        animate={animate}
        low={low}
        built={built}
        reach={reached}
        onBloom={(bloom, event) => report({ bloom }, event)}
        onLeave={leave}
      />
      {!low && (
        <Clouds
          top={stalk.top}
          tint={paletteAt(stalk.tiers.at(-1)?.strand ?? 0)}
          animate={animate}
          shown={gathered}
        />
      )}
    </group>
  );
}
