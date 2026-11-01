import { SEATING } from '../core/seating.js';
import type { Secondary } from '../desks/desk-profile.js';
import type { DrawSquad } from './squad-draw.js';

type ConsoleSource = Pick<DrawSquad, 'deskX' | 'deskZ' | 'deskRotation' | 'pods'>;
type Slot = { kind: Secondary; at: readonly [number, number, number]; tilt: number; width: number };
export type Panel = {
  kind: Secondary;
  x: number;
  y: number;
  z: number;
  yaw: number;
  width: number;
};

export const CONSOLE = { theme: 'dark', accent: '#43e6df', repaintMs: 1000 } as const;
const MAIN_SCREEN_Z = -0.3;
const SLOTS: readonly Slot[] = [
  { kind: 'dashboard', at: [-1.02, -0.04, 0.22], tilt: 0.5, width: 0.46 },
  { kind: 'terminal', at: [1.02, -0.04, 0.22], tilt: -0.5, width: 0.46 },
  { kind: 'chat', at: [-0.52, 0.42, 0.06], tilt: 0.22, width: 0.42 },
  { kind: 'browser', at: [0.52, 0.42, 0.06], tilt: -0.22, width: 0.42 },
  { kind: 'docs', at: [0, 0.78, 0], tilt: 0, width: 0.46 },
];
const TIERS = [
  { seated: 6, panels: 5 },
  { seated: 3, panels: 4 },
  { seated: 1, panels: 2 },
] as const;

export const CONSOLE_KINDS = SLOTS.map((slot) => slot.kind);

export function panelsOf(s: ConsoleSource): Panel[] {
  const seated = s.pods.filter((pod) => pod.member).length;
  const count = TIERS.find((tier) => seated >= tier.seated)?.panels ?? 0;
  const yaw = (s.deskRotation * Math.PI) / 2;
  const [cos, sin] = [Math.cos(yaw), Math.sin(yaw)];
  return SLOTS.slice(0, count).map(({ kind, at: [x, y, z], tilt, width }) => {
    const depth = z + MAIN_SCREEN_Z;
    return {
      kind,
      x: s.deskX + x * cos + depth * sin,
      y: SEATING.screenY + y,
      z: s.deskZ - x * sin + depth * cos,
      yaw: yaw + tilt,
      width,
    };
  });
}
