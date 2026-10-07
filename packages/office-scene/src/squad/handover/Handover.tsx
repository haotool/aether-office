import { useEffect, useLayoutEffect, useRef } from 'react';
import { useFrame, useThree } from '@react-three/fiber';
import { Quaternion, Vector3, type InstancedMesh } from 'three';
import {
  finishInstances,
  squadMaterials,
  withColors,
  writeInstance,
  writeInstances,
  type Instance,
} from '../squad-art.js';
import type { DrawSquad } from '../squad-draw.js';
import type { SquadFrame } from '../use-squad.js';
import { boxGeometry, sealGeometry, sealMaterial } from './handover-art.js';
import { BOX_CAPACITY, SEAL_CAPACITY, handoverItems } from './items.js';
import type { Book } from './book.js';
import type { StampKind } from './stamp.js';

const KINDS = ['received', 'returned'] as const satisfies readonly StampKind[];
const UP = new Vector3(0, 1, 0);
const turn = new Quaternion();
/** An idle hand-over layer looks again this often (an in-tray clears itself after minutes, by the clock). */
const IDLE_RECHECK_MS = 1000;

/** The same in-trays (the book is made anew every tick, but a tray nobody touched is the same object). */
const sameTrays = (a: Book['trays'], b: Book['trays']) => {
  const keys = Object.keys(a);
  return keys.length === Object.keys(b).length && keys.every((k) => a[k] === b[k]);
};

/**
 * Everything the hand-over puts on the desks: the folders (in a carrier's hands, in flight, stacked in the in-trays), the
 * stamps that press, and the seals they leave. One instanced mesh of boxes for the first two and one small mesh for each
 * of the two seals (a seal is drawn only while one is on show), so it costs three draw calls at most, however many
 * folders there are. Written every frame a hand-over is moving, and when the book changes.
 */
export function Handover({
  squads,
  frame,
  exploded,
  zh,
}: {
  squads: readonly DrawSquad[];
  frame: SquadFrame;
  exploded: boolean;
  zh: boolean;
}) {
  const invalidate = useThree((s) => s.invalidate);
  const { solid } = squadMaterials();
  const boxes = useRef<InstancedMesh>(null);
  const received = useRef<InstancedMesh>(null);
  const returned = useRef<InstancedMesh>(null);
  const seals = { received, returned };
  useLayoutEffect(() => withColors(boxes.current), []);
  useEffect(() => invalidate(), [squads, frame, exploded, invalidate]);
  // Nothing in hand and no seal popping: what is on the desks only changes with the book, the squads or the in-tray's clearing.
  const idle = useRef<{
    trays: Book['trays'];
    squads: unknown;
    exploded: boolean;
    at: number;
  } | null>(null);
  useFrame(() => {
    const now = Date.now();
    const book = frame.handover.book();
    const parked = idle.current;
    if (
      parked &&
      sameTrays(parked.trays, book.trays) &&
      parked.squads === squads &&
      parked.exploded === exploded &&
      now - parked.at < IDLE_RECHECK_MS
    )
      return;
    const items = handoverItems(book, squads, now, exploded);
    if (boxes.current)
      writeInstances(
        boxes.current,
        items.boxes.map((b): Instance => ({ at: b.at, yaw: b.yaw, scale: b.size, color: b.color })),
      );
    let popping = false;
    for (const kind of KINDS) {
      const mesh = seals[kind].current;
      if (!mesh) continue;
      let changed = false;
      items.seals[kind].forEach((s, i) => {
        popping ||= s.scale > 1;
        changed =
          writeInstance(
            mesh,
            i,
            s.at,
            turn.setFromAxisAngle(UP, s.yaw),
            [s.scale, 1, s.scale],
            null,
          ) || changed;
      });
      finishInstances(mesh, items.seals[kind].length, changed);
    }
    idle.current =
      Object.keys(book.entries).length === 0 && !popping
        ? { trays: book.trays, squads, exploded, at: now }
        : null;
  });
  return (
    <>
      <instancedMesh
        ref={boxes}
        args={[boxGeometry(), solid, BOX_CAPACITY]}
        frustumCulled={false}
        renderOrder={2}
      />
      {KINDS.map((kind) => (
        <instancedMesh
          key={kind}
          ref={seals[kind]}
          args={[sealGeometry(), sealMaterial(zh, kind), SEAL_CAPACITY]}
          frustumCulled={false}
          renderOrder={3}
        />
      ))}
    </>
  );
}
