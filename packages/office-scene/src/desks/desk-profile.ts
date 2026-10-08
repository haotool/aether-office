import { weighted } from '../environment/pick.js';
import { seeded } from '../environment/seeded.js';

/**
 * How one member's desk is dressed: the editor theme, the window chrome, whether there is a second monitor and what is
 * on it, and the small things on the desk. All of it is drawn from the member's id (and role), never from anything
 * the session says, so it is decoration that stays the same for the same member and differs between members.
 */
export type Theme = 'dark' | 'light';
export type Chrome = 'mac' | 'win' | 'flat';
export type DeskItem = 'mug' | 'plant' | 'figure' | 'headphones' | 'notepad' | 'sticky';
export type Secondary = 'docs' | 'browser' | 'terminal' | 'chat' | 'dashboard';

export type DeskProfile = {
  theme: Theme;
  chrome: Chrome;
  monitors: 1 | 2;
  secondary: Secondary | null;
  /** Which side of the main monitor the second one stands on. */
  side: 'left' | 'right';
  items: DeskItem[];
  /** Index into the palette of sticky notes. */
  sticky: number;
  /** Which of three wallpapers its lock screen shows. */
  wallpaper: 0 | 1 | 2;
};

export const DESK_WEIGHTS = {
  theme: { dark: 70, light: 30 },
  chrome: { mac: 45, win: 30, flat: 25 },
  items: { mug: 5, plant: 3, figure: 2, headphones: 3, notepad: 3, sticky: 3 } satisfies Record<
    DeskItem,
    number
  >,
} as const;

/** The chance a role has a second monitor. */
export const MONITOR_CHANCE: Record<string, number> & { default: number } = {
  backend: 0.55,
  platform: 0.6,
  sre: 0.65,
  data: 0.55,
  ml: 0.55,
  analytics: 0.5,
  architect: 0.5,
  security: 0.5,
  frontend: 0.5,
  fullstack: 0.5,
  default: 0.3,
};

const SECONDARY: Record<string, Partial<Record<Secondary, number>>> = {
  sre: { dashboard: 5, terminal: 3 },
  platform: { dashboard: 4, terminal: 3 },
  release: { dashboard: 3, terminal: 3 },
  'product-manager': { chat: 4, docs: 3 },
  docs: { browser: 3, docs: 3 },
  research: { browser: 4, docs: 3 },
  data: { docs: 3, terminal: 2, dashboard: 2 },
  ml: { dashboard: 4, terminal: 3 },
  analytics: { dashboard: 5, docs: 2 },
};
const SECONDARY_DEFAULT: Partial<Record<Secondary, number>> = {
  docs: 4,
  browser: 4,
  terminal: 3,
  chat: 1,
};

/** The things a role keeps on its desk lean a little: writers have notepads, headphones go with the heads-down roles. */
const ITEM_BIAS: Record<string, Partial<Record<DeskItem, number>>> = {
  docs: { notepad: 3, sticky: 2 },
  'product-manager': { sticky: 3, notepad: 2 },
  ml: { headphones: 2, plant: 1 },
  frontend: { figure: 2 },
};

export function deskProfile(seed: string, role: string): DeskProfile {
  const r = seeded(`${seed}:desk`);
  const theme = weighted(r, DESK_WEIGHTS.theme);
  const chrome = weighted(r, DESK_WEIGHTS.chrome);
  const monitors = r() < (MONITOR_CHANCE[role] ?? MONITOR_CHANCE.default) ? 2 : 1;
  const secondary =
    monitors === 2
      ? weighted(r, (SECONDARY[role] ?? SECONDARY_DEFAULT) as Record<Secondary, number>)
      : null;
  const side = r() < 0.5 ? 'left' : 'right';
  const pool: Record<string, number> = { ...DESK_WEIGHTS.items };
  for (const [item, extra] of Object.entries(ITEM_BIAS[role] ?? {}))
    pool[item] = (pool[item] ?? 0) + (extra ?? 0);
  const items: DeskItem[] = [];
  for (let n = 1 + Math.floor(r() * 3); n > 0; n--) {
    const item = weighted(r, pool) as DeskItem;
    items.push(item);
    delete pool[item]; // one of each kind
  }
  return {
    theme,
    chrome,
    monitors,
    secondary,
    side,
    items,
    sticky: Math.floor(r() * 4),
    wallpaper: Math.floor(r() * 3) as 0 | 1 | 2,
  };
}
