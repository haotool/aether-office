// What the hand-over draws at a moment: the boxes (folders in hand, in flight and stacked in the in-trays, and the stamps)
// and the seals. Pure: the book, the squads and the clock in, lists of instances out. The layer writes them into one
// instanced mesh (the boxes) and two (the seals, one per word), so the whole hand-over is a handful of draw calls however
// many folders there are.
import { hashText } from '../../random.js';
import { floorY } from '../../scene-geometry.js';
import { DESK_TOP } from '../squad-art.js';
import type { DrawSquad } from '../squad-draw.js';
import { trayView, type Book } from './book.js';
import { MANILA, STAMP_BASE, STAMP_HANDLE, TAB } from './handover-art.js';
import { FOLDER_THICKNESS, deskPlaces, folderAt, pressAt } from './plan.js';
import type { StampKind } from './stamp.js';

/** Boxes the mesh has room for: five folders (two boxes each) and a stamp (two) for each of 8 supervisors, and 16 more in hand. */
export const BOX_CAPACITY = 160;
export const SEAL_CAPACITY = 8;

type BoxItem = {
  at: readonly [number, number, number];
  size: readonly [number, number, number];
  yaw: number;
  color: string;
};
type SealItem = { at: readonly [number, number, number]; yaw: number; scale: number };
type HandoverItems = { boxes: BoxItem[]; seals: Record<StampKind, SealItem[]> };

const FOLDER = [0.3, FOLDER_THICKNESS, 0.22] as const;
const TAB_SIZE = [0.1, FOLDER_THICKNESS, 0.04] as const;
const TAB_AT = [0.08, 0, -0.13] as const;
/** How high the stamp rises on its way over to the tray and back. */
const STAMP_ARC_M = 0.03;
/** How long the seal's pop lasts after the stamp touches. */
const SEAL_POP_MS = 150;
const ease = (k: number) => k * k * (3 - 2 * k);

type At = readonly [number, number, number];

/** A folder (the body and its tab) centred at `at`, turned by `yaw`. */
function folder(out: BoxItem[], at: At, yaw: number, shade: string, tab: string, scale = 1): void {
  const cos = Math.cos(yaw);
  const sin = Math.sin(yaw);
  out.push({
    at,
    size: [FOLDER[0] * scale, FOLDER[1] * scale, FOLDER[2] * scale],
    yaw,
    color: shade,
  });
  out.push({
    at: [
      at[0] + (TAB_AT[0] * cos + TAB_AT[2] * sin) * scale,
      at[1],
      at[2] + (-TAB_AT[0] * sin + TAB_AT[2] * cos) * scale,
    ],
    size: [TAB_SIZE[0] * scale, TAB_SIZE[1] * scale, TAB_SIZE[2] * scale],
    yaw,
    color: tab,
  });
}

/** Each folder of a stack lies a little askew, picked by the seed (stable as the stack grows). */
const askew = (seed: number, i: number) => (((hashText(`${seed}:${i}`) % 200) - 100) / 100) * 0.14;

export function handoverItems(
  book: Book,
  squads: readonly DrawSquad[],
  now: number,
  exploded: boolean,
): HandoverItems {
  const boxes: BoxItem[] = [];
  const seals: HandoverItems['seals'] = { received: [], returned: [] };
  for (const s of squads) {
    const base = floorY(s.floor, exploded);
    const home = deskPlaces({ x: s.deskX, z: s.deskZ, rotation: s.deskRotation }, s.side);
    const mine = Object.values(book.entries).filter((e) => e.supervisor === s.supervisor);
    const { count, seal } = trayView(book, s.supervisor, now);
    const slotY = (n: number) => base + home.tray[1] + n * FOLDER_THICKNESS;
    // The stack: the folders delivered so far, the top one wearing the colour of the last stamp.
    for (let i = 0; i < count; i++)
      folder(
        boxes,
        [home.tray[0], slotY(i), home.tray[2]],
        askew(seal?.seed ?? 0, i),
        MANILA[hashText(`${s.supervisor}:${i}`) % MANILA.length]!,
        i === count - 1 && seal ? TAB[seal.kind] : TAB.received,
      );
    // Folders on their way: in the carrier's hands, gliding into the tray, popping up in it.
    for (const e of mine) {
      const pose = folderAt(e.plan, now - e.since, count);
      if (pose.state === 'hidden') continue;
      folder(
        boxes,
        [pose.x, base + pose.y, pose.z],
        pose.yaw,
        MANILA[e.plan.seed % MANILA.length]!,
        TAB[e.plan.kind],
        pose.scale,
      );
    }
    // The stamp rests on the desk; when the supervisor has read it goes over the in-tray, presses and comes back.
    const press = Math.min(1, Math.max(0, ...mine.map((e) => pressAt(e.plan, now - e.since))));
    const k = ease(press);
    const lerp = (a: number, b: number) => a + (b - a) * k;
    const x = lerp(home.stamp[0], home.tray[0]);
    const z = lerp(home.stamp[2], home.tray[2]);
    const onPaper = slotY(Math.max(0, count - 1)) + FOLDER_THICKNESS / 2;
    const y =
      lerp(base + DESK_TOP, onPaper) +
      0.015 +
      STAMP_ARC_M * Math.sin(press * Math.PI) * (1 - press);
    boxes.push({ at: [x, y, z], size: [0.1, 0.03, 0.1], yaw: 0, color: STAMP_BASE });
    boxes.push({ at: [x, y + 0.065, z], size: [0.045, 0.1, 0.045], yaw: 0, color: STAMP_HANDLE });
    // The seal on the top folder, from the moment the stamp touches it, with a small pop.
    const age = seal ? now - seal.at : -1;
    if (seal && count > 0 && age >= 0)
      seals[seal.kind].push({
        at: [home.tray[0], slotY(count - 1) + FOLDER_THICKNESS / 2 + 0.003, home.tray[2]],
        yaw: askew(seal.seed, 99) * 2,
        scale: 1 + 0.25 * Math.max(0, 1 - age / SEAL_POP_MS),
      });
  }
  return { boxes: boxes.slice(0, BOX_CAPACITY), seals };
}
