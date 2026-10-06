import { useEffect, useLayoutEffect, useMemo, useRef } from 'react';
import { useFrame, useThree, type ThreeEvent } from '@react-three/fiber';
import { Color, IcosahedronGeometry, Matrix4, MeshBasicMaterial, Quaternion, Vector3 } from 'three';
import type { InstancedMesh, ShaderMaterial } from 'three';
import { Clouds } from './Clouds.js';
import { Garden } from './Garden.js';
import type { BloomInfo } from './garden-geometry.js';
import { PALETTE, type Stalk, type StalkNode } from './stalk-layout.js';
import { stalkMaterial, stalkTubes } from './stalk-materials.js';

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
const MERGE_COLOR = '#ffffff';
const BEAD_SHINE = 0.45; // how far a bead's colour is taken towards white

/**
 * The Git spire: a braid of glass strands up the building's axis, one crystal bead for each commit and energy pulses running
 * up the cores, then the flowering crown that history builds above the roof (a bloom for each tier of it, on stems that leave the braid) and a bank of clouds round its tip. Everything is laid out
 * in the building's own coordinates (spread apart already when the floors are). The first time it is shown it builds itself:
 * the braid climbs, then the tiers' flowers open one after another from buds, then the clouds gather; a tier that arrives with new commits blooms
 * the same way, and with motion off or reduced it is simply complete. Five draw calls (strands, beads, flowers, pollen, clouds); nothing
 * casts a shadow.
 */
export function Beanstalk({
  stalk,
  animate,
  low,
  onHover,
}: {
  stalk: Stalk;
  animate: boolean;
  /** Fewer sides and path points on the strands, and no clouds. */
  low: boolean;
  onHover: (hover: StalkHover) => void;
}) {
  const size = useThree((s) => s.size);
  const nodesMesh = useRef<InstancedMesh>(null);
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

  // A bead is as big as its strand's tube, but never so big that it runs into its neighbours on a crowded stretch.
  const radii = useMemo(() => {
    const heights = new Map<number, number[]>();
    for (const n of stalk.nodes)
      heights.set(n.strand, [...(heights.get(n.strand) ?? []), n.position[1]]);
    for (const list of heights.values()) list.sort((a, b) => a - b);
    return stalk.nodes.map((n) => {
      const list = heights.get(n.strand)!;
      const at = list.indexOf(n.position[1]);
      const room = Math.min(
        (list[at + 1] ?? Infinity) - n.position[1],
        n.position[1] - (list[at - 1] ?? -Infinity),
      );
      const base = Math.max(0.16, stalk.strands[n.strand]!.radius * 1.4);
      return Math.max(0.07, Math.min(n.merge ? base * 1.5 : base, room * 0.4));
    });
  }, [stalk]);
  const place = (reach: number) => {
    const mesh = nodesMesh.current;
    if (!mesh) return;
    const matrix = new Matrix4();
    const quaternion = new Quaternion();
    stalk.nodes.forEach((n, i) => {
      const scale = n.position[1] <= reach ? radii[i]! : 0;
      mesh.setMatrixAt(
        i,
        matrix.compose(new Vector3(...n.position), quaternion, new Vector3(scale, scale, scale)),
      );
    });
    mesh.instanceMatrix.needsUpdate = true;
  };

  // The build: `grown` climbs the braid, `built` counts tiers (the spire is the last), `gathered` is the clouds. A spire that
  // was already built stays so when its data refreshes; a tier that is new rises after the ones that were already there.
  const grown = useRef(animate ? 0 : 1);
  const built = useRef(animate ? 0 : stalk.tiers.length + 1);
  const gathered = useRef(animate ? 0 : 1);
  const clock = useRef(0);
  const reached = useRef(0);
  const reach = () => {
    const eased = 1 - (1 - grown.current) ** 3;
    return grown.current >= 1 ? stalk.top + 1 : -3 + eased * (stalk.top + 4);
  };
  useLayoutEffect(() => {
    const mesh = nodesMesh.current;
    if (!mesh) return;
    const color = new Color();
    stalk.nodes.forEach((n, i) =>
      mesh.setColorAt(
        i,
        color
          .set(n.merge ? MERGE_COLOR : PALETTE[n.strand % PALETTE.length]!)
          .lerp(new Color('#ffffff'), n.merge ? 0 : BEAD_SHINE),
      ),
    );
    mesh.instanceColor!.needsUpdate = true;
    place(reach());
  }, [stalk]); // eslint-disable-line react-hooks/exhaustive-deps -- placed once per layout; the build continues in the frame loop
  useFrame((_state, delta) => {
    const { uniforms } = skin as ShaderMaterial;
    clock.current += animate ? delta : 0;
    uniforms['time']!.value = animate ? clock.current : 3;
    uniforms['energy']!.value = stalk.energy;
    if (animate) {
      const tiers = stalk.tiers.length + 1;
      if (grown.current < 1) {
        grown.current = Math.min(1, grown.current + delta / GROW_SECONDS);
        place(reach());
      } else if (built.current < tiers) {
        built.current = Math.min(tiers, built.current + delta / TIER_SECONDS);
      } else {
        gathered.current = Math.min(1, gathered.current + delta / CLOUD_SECONDS);
      }
    } else {
      grown.current = 1;
      built.current = stalk.tiers.length + 1;
      gathered.current = 1;
    }
    reached.current = reach();
    uniforms['grow']!.value = reached.current;
  });

  const last = useRef(0);
  const dismiss = useRef<ReturnType<typeof setTimeout>>(undefined);
  useEffect(() => () => clearTimeout(dismiss.current), []);
  const report = (
    target: { node: StalkNode } | { bloom: BloomInfo } | undefined,
    event: ThreeEvent<PointerEvent | MouseEvent>,
  ) => {
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
  const nearest = (point: Vector3) => {
    let best: StalkNode | undefined;
    let distance = Infinity;
    for (const n of stalk.nodes) {
      const d = point.distanceToSquared(new Vector3(...n.position));
      if (d < distance) [best, distance] = [n, d];
    }
    return best && { node: best };
  };
  const leave = () => onHover(null);

  return (
    <group>
      {tubes && (
        <mesh
          geometry={tubes}
          material={skin}
          frustumCulled={false}
          onPointerMove={(e) => report(nearest(e.point), e)}
          onClick={(e) => report(nearest(e.point), e)}
          onPointerOut={leave}
        />
      )}
      <instancedMesh
        key={stalk.nodes.length}
        ref={nodesMesh}
        args={[bead, glow, stalk.nodes.length]}
        frustumCulled={false}
        onPointerMove={(e) => report({ node: stalk.nodes[e.instanceId ?? -1]! }, e)}
        onClick={(e) => report({ node: stalk.nodes[e.instanceId ?? -1]! }, e)}
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
          tint={PALETTE[(stalk.tiers.at(-1)?.strand ?? 0) % PALETTE.length]!}
          animate={animate}
          shown={gathered}
        />
      )}
    </group>
  );
}
