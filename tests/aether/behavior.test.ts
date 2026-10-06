import { describe, expect, it } from 'vitest';
import {
  BEHAVIOR_WEIGHTS,
  COOLDOWN,
  driftOf,
  microAction,
  workMode,
  type BehaviorInput,
} from '../../packages/office-scene/src/behavior.js';
import { CLIPS, type ClipName } from '../../packages/office-scene/src/animal-states.js';

const base: BehaviorInput = {
  activity: 'working',
  mode: 'working',
  seed: 'member-1',
  n: 0,
  intensity: 1,
  species: 'fox',
  secondMonitor: false,
  quietMinutes: null,
  recent: [],
};

/** The first `count` actions of a member, feeding each choice back as history the way the scene does. */
function run(over: Partial<BehaviorInput>, count: number) {
  const out: { clip: ClipName; waitMs: number; holdMs?: number }[] = [];
  let recent: ClipName[] = [];
  for (let n = 0; n < count; n++) {
    const next = microAction({ ...base, ...over, n, recent });
    if (!next) return out;
    out.push(next);
    recent = [...recent.slice(-(COOLDOWN - 1)), next.clip];
  }
  return out;
}

describe('what real work looks like', () => {
  const fact = (
    state: string,
    tool: string | null,
    recent: { tool: string; target: string | null }[] = [],
  ) => workMode({ state, tool, recent } as Parameters<typeof workMode>[0]);

  it('is waiting for the model when working with no tool running, reading for look-up tools, else working', () => {
    expect(fact('working', null)).toBe('model');
    expect(fact('working', 'Read', [{ tool: 'Read', target: 'a.ts' }])).toBe('reading');
    expect(fact('working', 'Grep')).toBe('reading');
    expect(fact('working', 'WebFetch')).toBe('reading');
    expect(fact('working', 'Edit', [{ tool: 'Edit', target: 'a.ts' }])).toBe('working');
    expect(fact('working', 'Bash', [{ tool: 'Bash', target: 'ls' }])).toBe('working');
    expect(workMode(undefined)).toBe('working');
  });
});

describe('the behavior director', () => {
  it('is the same for the same member, moment and history, and differs between members', () => {
    expect(microAction({ ...base, n: 4 })).toEqual(microAction({ ...base, n: 4 }));
    const a = run({}, 20).map((m) => `${m.clip}${m.waitMs}`);
    const b = run({ seed: 'member-2' }, 20).map((m) => `${m.clip}${m.waitMs}`);
    expect(a).not.toEqual(b);
  });

  it('only picks clips the models have, and acts only in states a person idles about in', () => {
    for (const activity of ['idle', 'working', 'reviewing', 'error'] as const)
      for (const m of run({ activity }, 30)) expect(CLIPS).toContain(m.clip);
    for (const activity of [
      'waiting_permission',
      'waiting_peer',
      'offline',
      'unknown',
      'starting',
    ] as const)
      expect(microAction({ ...base, activity })).toBeNull();
  });

  it('never repeats a clip inside the cool-down, over many members and states', () => {
    for (const activity of ['idle', 'working', 'reviewing', 'error'] as const)
      for (let s = 0; s < 40; s++) {
        const picks = run({ activity, seed: `seed-${s}` }, 40).map((m) => m.clip);
        const window = activity === 'error' ? 1 : COOLDOWN; // a table of two can only alternate
        for (let i = 0; i < picks.length; i++)
          for (let j = Math.max(0, i - window); j < i; j++) expect(picks[i]).not.toBe(picks[j]);
      }
  });

  it('keeps an idle member from claiming work, a decision or a message', () => {
    const seen = new Set(
      Array.from({ length: 60 }, (_, s) => run({ activity: 'idle', seed: `s${s}` }, 12))
        .flat()
        .map((m) => m.clip),
    );
    for (const claim of [
      'thinking',
      'scratch_head',
      'nod',
      'cheer',
      'typing',
      'reviewing',
      'celebrate',
    ] as const)
      expect(seen).not.toContain(claim);
    expect(seen.size).toBeGreaterThanOrEqual(3);
  });

  it('leans back to think while the model works, nods while reading, and shrugs on an error', () => {
    const count = (over: Partial<BehaviorInput>, clip: ClipName) => {
      let hits = 0;
      let total = 0;
      for (let s = 0; s < 80; s++)
        for (const m of run({ ...over, seed: `seed-${s}` }, 10)) {
          total++;
          if (m.clip === clip) hits++;
        }
      return hits / total;
    };
    expect(count({ mode: 'model' }, 'thinking')).toBeGreaterThan(0.2);
    expect(count({ mode: 'working' }, 'thinking')).toBeLessThan(
      count({ mode: 'model' }, 'thinking'),
    );
    expect(count({ mode: 'reading' }, 'nod')).toBeGreaterThan(0.15);
    expect(count({ mode: 'working' }, 'nod')).toBe(0);
    expect(count({ activity: 'error' }, 'shrug')).toBeGreaterThan(0.3);
  });

  it('keeps each clip near its configured weight over many members', () => {
    const weights = BEHAVIOR_WEIGHTS['working:model'];
    const total = Object.values(weights).reduce((a, b) => a + b, 0);
    const counts = new Map<string, number>();
    let all = 0;
    for (let s = 0; s < 200; s++)
      for (const m of run({ mode: 'model', seed: `seed-${s}`, species: 'otter' }, 8)) {
        counts.set(m.clip, (counts.get(m.clip) ?? 0) + 1);
        all++;
      }
    // Cool-down and species bias move the shares, but the order of the table holds: the heaviest clip stays the most frequent.
    const heaviest = Object.entries(weights).sort((a, b) => b[1] - a[1])[0]![0];
    const most = [...counts.entries()].sort((a, b) => b[1] - a[1])[0]![0];
    expect(most).toBe(heaviest);
    for (const [clip, weight] of Object.entries(weights))
      expect(Math.abs((counts.get(clip) ?? 0) / all - weight / total)).toBeLessThan(0.17);
  });

  it('glances at the second monitor more when there is one, and yawns more after a long quiet', () => {
    const share = (over: Partial<BehaviorInput>, clip: ClipName) => {
      let hits = 0;
      let total = 0;
      for (let s = 0; s < 80; s++)
        for (const m of run({ ...over, seed: `seed-${s}` }, 10)) {
          total++;
          if (m.clip === clip) hits++;
        }
      return hits / total;
    };
    expect(share({ secondMonitor: true }, 'look_around')).toBeGreaterThan(
      share({ secondMonitor: false }, 'look_around') * 1.4,
    );
    expect(share({ activity: 'idle', quietMinutes: 20 }, 'stretch')).toBeGreaterThan(
      share({ activity: 'idle', quietMinutes: 1 }, 'stretch') * 1.08,
    );
  });

  it('pauses typing in short micro-pauses and waits like a person: seconds, never a metronome', () => {
    const picks = Array.from({ length: 40 }, (_, s) => run({ seed: `seed-${s}` }, 10)).flat();
    const pauses = picks.filter((m) => m.clip === 'seated_idle');
    expect(pauses.length).toBeGreaterThan(10);
    for (const p of pauses) {
      expect(p.holdMs).toBeGreaterThanOrEqual(600);
      expect(p.holdMs).toBeLessThanOrEqual(2400);
    }
    const waits = picks.map((m) => m.waitMs);
    expect(Math.min(...waits)).toBeGreaterThanOrEqual(2000);
    expect(Math.max(...waits)).toBeLessThan(25_000);
    expect(new Set(waits).size).toBeGreaterThan(waits.length * 0.9);
  });

  it('works harder, rests less: busier members pause more often and sip less', () => {
    const share = (intensity: 0 | 1 | 2 | 3, clip: ClipName) => {
      let hits = 0;
      let total = 0;
      for (let s = 0; s < 120; s++)
        for (const m of run({ intensity, seed: `seed-${s}` }, 10)) {
          total++;
          if (m.clip === clip) hits++;
        }
      return hits / total;
    };
    expect(share(3, 'sip')).toBeLessThan(share(0, 'sip'));
    const wait = (i: 0 | 3) => run({ intensity: i }, 30).reduce((sum, m) => sum + m.waitMs, 0);
    expect(wait(3)).toBeLessThan(wait(0));
  });

  it('gives species their quirks', () => {
    const share = (species: string, clip: ClipName) => {
      let hits = 0;
      let total = 0;
      for (let s = 0; s < 150; s++)
        for (const m of run({ activity: 'idle', species, seed: `seed-${s}` }, 10)) {
          total++;
          if (m.clip === clip) hits++;
        }
      return hits / total;
    };
    expect(share('cat', 'stretch')).toBeGreaterThan(share('dog', 'stretch'));
    expect(share('rabbit', 'look_around')).toBeGreaterThan(share('bear', 'look_around'));
  });
});

describe('posture drift', () => {
  it('stays inside ten degrees of yaw and a small lean, and moves slowly', () => {
    let previous = driftOf('member-1', 0);
    for (let t = 0; t < 600; t += 0.05) {
      const d = driftOf('member-1', t);
      expect(Math.abs(d.yaw)).toBeLessThanOrEqual((10 * Math.PI) / 180 + 1e-9);
      expect(Math.abs(d.lean)).toBeLessThanOrEqual(0.035);
      expect(Math.abs(d.yaw - previous.yaw)).toBeLessThan(0.01); // radians per 50 ms
      previous = d;
    }
  });

  it('is never the same for two neighbours at the same moment', () => {
    const at = (seed: string) => driftOf(seed, 37.5).yaw;
    const yaws = Array.from({ length: 30 }, (_, i) => at(`member-${i}`));
    expect(new Set(yaws.map((y) => y.toFixed(7))).size).toBe(30);
  });
});
