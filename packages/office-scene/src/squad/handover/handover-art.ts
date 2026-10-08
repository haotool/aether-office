// The hand-over's shared parts. Everything solid is one unit box (12 triangles) drawn by one instanced mesh: a folder is two
// of them (the body and its tab, 24 triangles), the stamp two more. The seal is a flat quad with the stamp's word on it.
import {
  BoxGeometry,
  BufferAttribute,
  CanvasTexture,
  Color,
  MeshBasicMaterial,
  PlaneGeometry,
  SRGBColorSpace,
  type BufferGeometry,
} from 'three';
import { STAMP_INK, stampWord, type StampKind } from './stamp.js';
import { intlLocale } from '../../i18n/scene-text.js';

let box: BufferGeometry | null = null;
/** A unit cube with white vertex colours: scaled and tinted per instance (the squad layers' solid material). */
export function boxGeometry(): BufferGeometry {
  if (box) return box;
  const g = new BoxGeometry(1, 1, 1);
  const n = g.getAttribute('position').count;
  g.setAttribute('color', new BufferAttribute(new Float32Array(n * 3).fill(1), 3));
  return (box = g.toNonIndexed());
}

let seal: BufferGeometry | null = null;
/** The seal's quad: 24 x 12 cm, lying flat (the instance's turn is about the vertical). */
export const sealGeometry = (): BufferGeometry =>
  (seal ??= new PlaneGeometry(0.24, 0.12).rotateX(-Math.PI / 2));

const ZH_FONT = '"PingFang TC", "Noto Sans TC", "Microsoft JhengHei", sans-serif';
const EN_FONT = 'ui-monospace, "SF Mono", Menlo, Consolas, monospace';

/** The stamp's word on a transparent ring, in white: the material tints it with the ink. */
function drawSeal(zh: boolean, kind: StampKind): HTMLCanvasElement {
  const canvas = document.createElement('canvas');
  canvas.width = 512;
  canvas.height = 256;
  const ctx = canvas.getContext('2d');
  if (!ctx) return canvas;
  ctx.strokeStyle = '#ffffff';
  ctx.fillStyle = '#ffffff';
  ctx.lineWidth = 12;
  ctx.beginPath();
  ctx.roundRect(14, 14, 484, 228, 26);
  ctx.stroke();
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  const word = stampWord(zh, kind);
  const family = zh ? ZH_FONT : EN_FONT;
  for (let size = zh ? 150 : 92; size > 24; size -= 2) {
    ctx.font = `700 ${size}px ${family}`;
    if (ctx.measureText(word).width <= 410) break;
  }
  ctx.fillText(word, 256, 132);
  return canvas;
}

const seals = new Map<string, MeshBasicMaterial>();
/** The seal's material for a word in a language: one per word, made when first shown. */
export function sealMaterial(zh: boolean, kind: StampKind): MeshBasicMaterial {
  const key = `${intlLocale(zh)}:${kind}`;
  let material = seals.get(key);
  if (!material) {
    const map = new CanvasTexture(drawSeal(zh, kind));
    map.colorSpace = SRGBColorSpace;
    material = new MeshBasicMaterial({
      map,
      color: new Color(STAMP_INK[kind]),
      transparent: true,
      opacity: 0.92,
      depthWrite: false,
      toneMapped: false,
      polygonOffset: true,
      polygonOffsetFactor: -2,
    });
    seals.set(key, material);
  }
  return material;
}

/** The manila shades a folder is drawn in: a little variety, picked by the seed. */
export const MANILA = ['#e3cf9c', '#dcc78f', '#e8d6a6', '#d8c488'] as const;
/** A folder's tab: a darker manila for a receipt, a plain grey for a return (never a colour that reads as pass or fail). */
export const TAB = { received: '#bda76c', returned: '#8b919b' } as const satisfies Record<
  StampKind,
  string
>;
export const STAMP_BASE = '#3a3f4c';
export const STAMP_HANDLE = '#c0c6d2';
