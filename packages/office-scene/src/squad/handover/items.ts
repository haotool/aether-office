import { hashText } from '../../environment/hash.js';
import { floorY } from '../../scene/scene-geometry.js';
import { DESK_TOP } from '../squad-art.js';
import type { DrawSquad } from '../squad-draw.js';
import { trayView, type Book } from './book.js';
import { MANILA, STAMP_BASE, STAMP_HANDLE, TAB } from './handover-art.js';
import { FOLDER_THICKNESS, deskPlaces, folderAt, pressAt, type DeskPlaces } from './plan.js';
import type { StampKind } from './stamp.js';
import { itemAt } from '../../environment/checked.js';

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
const STAMP_ARC_M = 0.03;
const SEAL_POP_MS = 150;
const ease = (k: number) => k * k * (3 - 2 * k);

type At = readonly [number, number, number];

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

const askew = (seed: number, i: number) => (((hashText(`${seed}:${i}`) % 200) - 100) / 100) * 0.14;

function inFlight(
  boxes: BoxItem[],
  mine: readonly Book['entries'][string][],
  { base, now, count }: { base: number; now: number; count: number },
) {
  for (const e of mine) {
    const pose = folderAt(e.plan, now - e.since, count);
    if (pose.state === 'hidden') continue;
    folder(
      boxes,
      [pose.x, base + pose.y, pose.z],
      pose.yaw,
      itemAt(MANILA, e.plan.seed % MANILA.length),
      TAB[e.plan.kind],
      pose.scale,
    );
  }
}

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
    for (let i = 0; i < count; i++)
      folder(
        boxes,
        [home.tray[0], slotY(i), home.tray[2]],
        askew(seal?.seed ?? 0, i),
        itemAt(MANILA, hashText(`${s.supervisor}:${i}`) % MANILA.length),
        i === count - 1 && seal ? TAB[seal.kind] : TAB.received,
      );
    inFlight(boxes, mine, { base, now, count });
    const press = Math.min(1, Math.max(0, ...mine.map((e) => pressAt(e.plan, now - e.since))));
    const onPaper = slotY(Math.max(0, count - 1)) + FOLDER_THICKNESS / 2;
    stamp(boxes, home, press, base + DESK_TOP, onPaper);
    const age = seal ? now - seal.at : -1;
    if (seal && count > 0 && age >= 0)
      seals[seal.kind].push({
        at: [home.tray[0], onPaper + 0.003, home.tray[2]],
        yaw: askew(seal.seed, 99) * 2,
        scale: 1 + 0.25 * Math.max(0, 1 - age / SEAL_POP_MS),
      });
  }
  return { boxes: boxes.slice(0, BOX_CAPACITY), seals };
}

function stamp(
  boxes: BoxItem[],
  home: DeskPlaces,
  press: number,
  deskTop: number,
  onPaper: number,
) {
  const k = ease(press);
  const lerp = (a: number, b: number) => a + (b - a) * k;
  const x = lerp(home.stamp[0], home.tray[0]);
  const z = lerp(home.stamp[2], home.tray[2]);
  const y = lerp(deskTop, onPaper) + 0.015 + STAMP_ARC_M * Math.sin(press * Math.PI) * (1 - press);
  boxes.push({ at: [x, y, z], size: [0.1, 0.03, 0.1], yaw: 0, color: STAMP_BASE });
  boxes.push({ at: [x, y + 0.065, z], size: [0.045, 0.1, 0.045], yaw: 0, color: STAMP_HANDLE });
}
