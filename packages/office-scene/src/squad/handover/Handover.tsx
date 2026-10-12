import { useEffect, useLayoutEffect, useRef, type RefObject } from 'react';
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
const IDLE_RECHECK_MS = 1000;

const sameTrays = (a: Book['trays'], b: Book['trays']) => {
  const keys = Object.keys(a);
  return keys.length === Object.keys(b).length && keys.every((k) => a[k] === b[k]);
};

type HandoverProps = {
  squads: readonly DrawSquad[];
  frame: SquadFrame;
  exploded: boolean;
  zh: boolean;
};
const asInstance = (b: ReturnType<typeof handoverItems>['boxes'][number]): Instance => ({
  at: b.at,
  yaw: b.yaw,
  scale: b.size,
  color: b.color,
});

type Parked = { trays: Book['trays']; squads: unknown; exploded: boolean; at: number };
type SealMeshes = Record<(typeof KINDS)[number], RefObject<InstancedMesh | null>>;

function stillParked(parked: Parked | null, now: Parked): boolean {
  return (
    parked !== null &&
    sameTrays(parked.trays, now.trays) &&
    parked.squads === now.squads &&
    parked.exploded === now.exploded &&
    now.at - parked.at < IDLE_RECHECK_MS
  );
}

function writeSeals(meshes: SealMeshes, shown: ReturnType<typeof handoverItems>['seals']): boolean {
  let popping = false;
  for (const kind of KINDS) {
    const mesh = meshes[kind].current;
    if (!mesh) continue;
    let changed = false;
    shown[kind].forEach((s, i) => {
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
    finishInstances(mesh, shown[kind].length, changed);
  }
  return popping;
}

export function Handover({ squads, frame, exploded, zh }: HandoverProps) {
  const invalidate = useThree((s) => s.invalidate);
  const { solid } = squadMaterials();
  const boxes = useRef<InstancedMesh>(null);
  const received = useRef<InstancedMesh>(null);
  const returned = useRef<InstancedMesh>(null);
  const seals = { received, returned };
  useLayoutEffect(() => withColors(boxes.current), []);
  useEffect(() => invalidate(), [squads, frame, exploded, invalidate]);
  const idle = useRef<Parked | null>(null);
  useFrame(() => {
    const now = Date.now();
    const book = frame.handover.book();
    if (stillParked(idle.current, { trays: book.trays, squads, exploded, at: now })) return;
    const items = handoverItems(book, squads, now, exploded);
    if (boxes.current) writeInstances(boxes.current, items.boxes.map(asInstance));
    const popping = writeSeals(seals, items.seals);
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
