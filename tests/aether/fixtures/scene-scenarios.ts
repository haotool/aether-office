// Each scenario runs a fixed, seeded set of inputs through the scene's pure modules and reduces the outputs to a short
// digest, so a refactor that keeps behaviour keeps them. Numbers are rounded to 1e-6 so a last-place difference in a
// platform's maths cannot fail a test.
import { createHash } from 'node:crypto';
import type { Agent } from '../../../packages/contracts/src/index.js';
import type * as Building from '../../../packages/office-scene/src/environment/building.js';
import type * as Director from '../../../packages/office-scene/src/environment/director.js';
import type * as DeskItems from '../../../packages/office-scene/src/desks/desk-items.js';
import type * as Garden from '../../../packages/office-scene/src/core/garden-geometry.js';
import type * as Genome from '../../../packages/office-scene/src/flowers/flower-genome.js';
import type * as Layout from '../../../packages/office-scene/src/environment/layout.js';
import type * as Multi from '../../../packages/office-scene/src/core/multi-view.js';
import type * as ScreenLayout from '../../../packages/office-scene/src/screen/screen-layout.js';
import type * as ScreenTheme from '../../../packages/office-scene/src/screen/screen-theme.js';
import type * as ScreenViews from '../../../packages/office-scene/src/screen/screen-views.js';
import type * as Squad from '../../../packages/office-scene/src/squad/squad-model.js';
import type * as Stalk from '../../../packages/office-scene/src/core/stalk-layout.js';
import type * as Camera from '../../../packages/office-scene/src/core/shot-camera.js';
import { screens } from './screen-scenarios.js';

export type SceneModules = {
  seeded: (seed: string) => () => number;
  genome: Pick<typeof Genome, 'genomeOf'>;
  stalk: Pick<typeof Stalk, 'layoutStalk'>;
  garden: Pick<typeof Garden, 'gardenOf'>;
  director: Pick<typeof Director, 'chooseShot'>;
  camera: Pick<typeof Camera, 'poseAt' | 'chooseEntry'>;
  multi: Pick<typeof Multi, 'chooseFeeds'>;
  squad: Pick<typeof Squad, 'stepSquad' | 'EMPTY_SQUAD'>;
  layout: Pick<typeof Layout, 'defaultLayout'>;
  building: Pick<typeof Building, 'buildFloor'>;
  items: Pick<typeof DeskItems, 'deskItemsGeometry'>;
  views: Pick<typeof ScreenViews, 'VIEWS'>;
  theme: Pick<typeof ScreenTheme, 'PALETTES'>;
  screenLayout: Pick<typeof ScreenLayout, 'currentWork'>;
};

const rounded = (_: string, v: unknown) =>
  typeof v === 'number' && Number.isFinite(v) ? Math.round(v * 1e6) / 1e6 : v;
const digest = (value: unknown) =>
  createHash('sha256').update(JSON.stringify(value, rounded)).digest('hex').slice(0, 16);

type Object3DLike = { traverse: (visit: (node: Node3D) => void) => void };
type Node3D = {
  type: string;
  position?: { toArray: () => number[] };
  rotation?: { toArray: () => unknown[] };
  scale?: { toArray: () => number[] };
  geometry?: { getAttribute: (name: string) => { array: ArrayLike<number> } | undefined };
};
const outline = (root: Object3DLike) => {
  const out: unknown[] = [];
  root.traverse((node) => {
    const positions = Array.from(node.geometry?.getAttribute('position')?.array ?? []);
    out.push([
      node.type,
      node.position?.toArray(),
      node.rotation?.toArray().slice(0, 3),
      node.scale?.toArray(),
      positions.length,
      positions.reduce((sum, v) => sum + v, 0),
    ]);
  });
  return out;
};

function history(m: SceneModules, seed: string, n: number) {
  const r = m.seeded(seed);
  const now = 1_800_000_000_000;
  const commits = Array.from({ length: n }, (_, i) => {
    const parents: string[] = i > 0 ? [`c${i - 1}`] : [];
    if (i > 3 && r() < 0.25) parents.push(`c${Math.floor(r() * (i - 1))}`);
    if (i > 2 && r() < 0.15) parents.splice(0, parents.length, `c${Math.floor(r() * i)}`);
    return {
      sha: `c${i}`,
      parents,
      refs: i === n - 1 ? ['HEAD -> main'] : r() < 0.1 ? [`feature/${i}`] : [],
      subject: `s${i}`,
      author: `a${Math.floor(r() * 4)}`,
      at: now - (n - i) * 86_400_000 * (0.2 + r()),
    };
  });
  return { newestFirst: commits.reverse(), now };
}

const ACTIVITIES: Agent['activity'][] = [
  'working',
  'idle',
  'error',
  'reviewing',
  'waiting_permission',
  'waiting_peer',
  'starting',
  'offline',
  'unknown',
];

function genomes(m: SceneModules) {
  const r = m.seeded('genomes');
  return Array.from({ length: 400 }, (_, i) =>
    m.genome.genomeOf({
      seed: `s${i}`,
      merges: Math.floor(r() * 4),
      authors: Math.floor(r() * 5),
      branches: Math.floor(r() * 6),
      grand: r() < 0.2,
    }),
  );
}

function stalks(m: SceneModules) {
  const out: unknown[] = [];
  for (let t = 0; t < 14; t++) {
    const { newestFirst, now } = history(m, `h${t}`, 5 + t * 3);
    const stalk = m.stalk.layoutStalk(newestFirst, now, 42);
    out.push(stalk);
    if (!stalk) continue;
    for (const low of [false, true]) {
      const garden = m.garden.gardenOf(stalk, low);
      out.push(
        garden && [
          Array.from(garden.mesh.getAttribute('position').array),
          garden.triangles,
          garden.twigs,
          garden.climb,
          garden.blooms.map((b) => b.genome),
        ],
      );
    }
  }
  return out;
}

function directing(m: SceneModules) {
  const r = m.seeded('director');
  const out: unknown[] = [];
  for (let t = 0; t < 300; t++) {
    const n = 1 + Math.floor(r() * 7);
    const agents = Array.from({ length: n }, (_, i) => ({
      id: `a${i}`,
      activity: ACTIVITIES[Math.floor(r() * ACTIVITIES.length)],
    })) as Agent[];
    const seats = new Map(
      Array.from(
        { length: n },
        (_, i) =>
          [
            `a${i}`,
            {
              x: r() * 20 - 10,
              z: r() * 20 - 10,
              floor: Math.floor(r() * 3),
              rotation: Math.floor(r() * 4),
            },
          ] as const,
      ),
    );
    const now = 1_000_000;
    const kinds = ['inform', 'request', 'decision', 'handoff', 'sub'] as const;
    const pulses = Array.from({ length: Math.floor(r() * 4) }, (_, i) => ({
      id: `p${i}`,
      from: `a${Math.floor(r() * n)}`,
      to: `a${Math.floor(r() * n)}`,
      kind: kinds[Math.floor(r() * 5)] ?? 'inform',
      at: now - r() * 25_000,
    }));
    const shown = new Map(
      Array.from({ length: Math.floor(r() * 4) }, (_, i) => [`a${i}`, now - r() * 40_000] as const),
    );
    const attention = new Map(
      Array.from({ length: Math.floor(r() * 2) }, (_, i) => [`a${i}`, 'x'] as const),
    );
    const intensity = new Map(
      Array.from({ length: n }, (_, i) => [`a${i}`, Math.floor(r() * 4)] as const),
    );
    const shot = m.director.chooseShot({
      agents,
      seats,
      pulses,
      attention,
      intensity,
      now,
      shown,
      previous: null,
    });
    out.push(shot);
    if (shot) {
      for (const exploded of [false, true])
        for (const at of [0, 0.3, 1]) out.push(m.camera.poseAt(shot, seats, at, 1.6, exploded));
      out.push(m.camera.chooseEntry(shot, shot, seats, 1.6));
    }
    const feeds = {
      agents,
      seats,
      intensity: new Map(intensity),
      taken: new Set(r() < 0.5 ? ['a0'] : []),
      previous: [],
      max: 5,
      pinned: new Set(r() < 0.3 ? ['a1'] : []),
      ...(r() < 0.5 ? { floor: 0 } : {}),
    };
    const first = m.multi.chooseFeeds(feeds);
    out.push(first, m.multi.chooseFeeds({ ...feeds, previous: first }));
  }
  return out;
}

function squads(m: SceneModules) {
  const r = m.seeded('squad');
  const statuses = ['running', 'waiting_permission', 'finished', 'unknown'] as const;
  let state = m.squad.EMPTY_SQUAD;
  let now = 1_000_000;
  const out: unknown[] = [];
  for (let step = 0; step < 300; step++) {
    now += Math.floor(r() * 9000);
    const input = {
      leaveMs: () => 8000,
      squads: ['s1', 's2'].map((supervisor) => ({
        supervisor,
        members: Array.from({ length: Math.floor(r() * 6) }, (_, i) => ({
          id: `${supervisor}:m${i}`,
          type: 'Explore',
          status: statuses[Math.floor(r() * 4)] ?? 'unknown',
          startedAt: r() < 0.2 ? null : now - Math.floor(r() * 60_000),
          lastSeen: now - Math.floor(r() * 40_000),
          toolCount: step,
          tokensPerMinute: r() < 0.5 ? null : Math.floor(r() * 2000),
          toolAt: r() < 0.5 ? null : now,
        })),
      })),
    };
    state = m.squad.stepSquad(state, input, now);
    out.push(state);
  }
  return out;
}

function layouts(m: SceneModules) {
  const r = m.seeded('layout');
  const out: unknown[] = [];
  for (let t = 0; t < 30; t++) {
    const agents = Array.from({ length: Math.floor(r() * 40) }, (_, i) => ({
      id: `a${i}`,
      activity: 'idle',
    })) as Agent[];
    out.push(m.layout.defaultLayout(agents, (agent) => Number(agent.id.slice(1)) % 5));
  }
  const layout = m.layout.defaultLayout([]);
  for (let floor = 0; floor < 5; floor++) {
    const built = m.building.buildFloor(layout, floor);
    const bare = <T extends { mesh: unknown }>(list: T[]) =>
      list.map(({ mesh: _mesh, ...rest }) => rest);
    out.push(
      outline(built.group),
      bare(built.orbiters),
      bare(built.spinners),
      built.streams.map((s) => [s.speed, s.height]),
    );
  }
  return out;
}

function deskItems(m: SceneModules) {
  const sets = [
    ['mug'],
    ['plant', 'figure'],
    ['headphones', 'notepad', 'sticky'],
    ['mug', 'plant', 'sticky'],
  ] as const;
  return sets.flatMap((set) =>
    [0, 1, 2, 3].map((tint) => {
      const geometry = m.items.deskItemsGeometry([...set], tint);
      return [
        Array.from(geometry?.getAttribute('position').array ?? []),
        Array.from(geometry?.getAttribute('color').array ?? []),
      ];
    }),
  );
}

export function runScenarios(m: SceneModules): Record<string, string> {
  return {
    genomes: digest(genomes(m)),
    stalks: digest(stalks(m)),
    directing: digest(directing(m)),
    squads: digest(squads(m)),
    layouts: digest(layouts(m)),
    deskItems: digest(deskItems(m)),
    screens: digest(screens(m)),
  };
}
