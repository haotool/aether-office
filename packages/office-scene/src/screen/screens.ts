import { CanvasTexture, SRGBColorSpace } from 'three';
import { seeded } from '../environment/seeded.js';
import { SCREEN_H, SCREEN_W, type Draw } from './screen-draw.js';
import {
  apiLogs,
  browserUi,
  editor,
  monitoring,
  phones,
  pipeline,
  releases,
} from './screen-art-dev.js';
import { diff, security, tests } from './screen-art-quality.js';
import { dataTables, kpis, training } from './screen-art-data.js';
import { architecture, documents, kanban, mindmap } from './screen-art-plan.js';
import { context2d } from '../core/canvas-2d.js';

const VARIANTS = 3;

const DEFAULT_DRAWS: Draw[] = [editor, browserUi];
const BY_ROLE: Record<string, Draw[]> = {
  frontend: [browserUi, editor],
  backend: [apiLogs, editor],
  fullstack: [editor, browserUi, apiLogs],
  mobile: [phones, editor],
  generalist: DEFAULT_DRAWS,
  platform: [pipeline, editor],
  sre: [monitoring, apiLogs],
  release: [releases, pipeline],
  qa: [tests, editor],
  security: [security, diff],
  review: [diff, editor],
  data: [dataTables, editor],
  ml: [training, editor],
  analytics: [kpis, dataTables],
  architect: [architecture, documents],
  docs: [documents, editor],
  'product-manager': [kanban, documents],
  research: [mindmap, documents],
};

const cache = new Map<string, CanvasTexture>();
/** The screen picture for a role and member, made once and reused. Bounded: roles × VARIANTS pictures at most. */
export function screenTexture(role: string, member: string, accent: string): CanvasTexture {
  const draws = BY_ROLE[role] ?? DEFAULT_DRAWS;
  const variant = Math.floor(seeded(member)() * VARIANTS);
  const key = `${role}:${variant}:${accent}`;
  const hit = cache.get(key);
  if (hit) return hit;
  const canvas = document.createElement('canvas');
  canvas.width = SCREEN_W;
  canvas.height = SCREEN_H;
  const g = context2d(canvas);
  const rng = seeded(`${role}:${variant}`);
  draws[variant % draws.length]?.(g, rng, accent);
  g.fillStyle = 'rgba(255,255,255,0.035)';
  for (let y = 0; y < SCREEN_H; y += 3) g.fillRect(0, y, SCREEN_W, 1);
  const texture = new CanvasTexture(canvas);
  texture.colorSpace = SRGBColorSpace;
  texture.anisotropy = 4;
  cache.set(key, texture);
  return texture;
}

export const screenRoles = Object.keys(BY_ROLE);
