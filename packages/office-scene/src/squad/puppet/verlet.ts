// Pure maths on typed arrays: the same pins and the same sequence of `dt` always give the same points, and no input (a
// huge `dt`, a teleporting pin, a NaN) can make it blow up.

export const POINTS = 6;
const SEGMENTS = POINTS - 1;
const TAUT = 0.98;
const SLACK = 1.15;
const DAMPING = 0.965;
const GRAVITY = -9.8 * 0.15;
const ITERATIONS = 3;
const SWAY_HZ = 0.25;
const SWAY_ACCEL = 0.55;
export const TELEPORT_M = 2.5;
/** The most any point may move in one step: whatever the input, a point never flies off. */
const MAX_STEP_M = 0.3;
/** Time one `stepStrings` call may catch up on, and the most steps it takes for it: a stalled tab does not owe a burst. */
const MAX_DT_S = 0.25;
const MAX_STEPS = 4;

export type Strings = {
  readonly capacity: number;
  count: number;
  readonly pos: Float32Array;
  readonly prev: Float32Array;
  readonly pins: Float32Array;
  readonly slack: Float32Array;
  readonly frozen: Uint8Array;
  readonly started: Uint8Array;
  time: number;
  carry: number;
};

export function createStrings(capacity: number): Strings {
  return {
    capacity,
    count: 0,
    pos: new Float32Array(capacity * POINTS * 3),
    prev: new Float32Array(capacity * POINTS * 3),
    pins: new Float32Array(capacity * 6),
    slack: new Float32Array(capacity),
    frozen: new Uint8Array(capacity),
    started: new Uint8Array(capacity),
    time: 0,
    carry: 0,
  };
}

export type Vec3 = readonly [number, number, number];

/** A float of a pooled array. Every index used below lies inside its array by construction; a stray one reads 0, never undefined. */
const read = (a: Float32Array, i: number): number => a[i] ?? 0;

export function straighten(s: Strings, i: number): void {
  const base = i * POINTS * 3;
  for (let p = 0; p < POINTS; p++) {
    const t = p / SEGMENTS;
    for (let k = 0; k < 3; k++) {
      const top = read(s.pins, i * 6 + k);
      const v = top + (read(s.pins, i * 6 + 3 + k) - top) * t;
      s.pos[base + p * 3 + k] = v;
      s.prev[base + p * 3 + k] = v;
    }
  }
}

const norm = (x: number, y: number, z: number) => Math.sqrt(x * x + y * y + z * z);

const finite = (v: Vec3) => Number.isFinite(v[0] + v[1] + v[2]);

/**
 * A string pinned for the first time, or whose pin jumped farther than a teleport, or given a pin that is not a number,
 * starts straight again instead of snapping like a whip.
 */
export function pinString(
  s: Strings,
  i: number,
  top: Vec3,
  bottom: Vec3,
  slack: number,
  frozen: boolean,
): void {
  if (i < 0 || i >= s.capacity || !finite(top) || !finite(bottom)) return;
  const at = i * 6;
  const { pins } = s;
  const jumped =
    !s.started[i] ||
    norm(top[0] - read(pins, at), top[1] - read(pins, at + 1), top[2] - read(pins, at + 2)) >
      TELEPORT_M ||
    norm(
      bottom[0] - read(pins, at + 3),
      bottom[1] - read(pins, at + 4),
      bottom[2] - read(pins, at + 5),
    ) > TELEPORT_M;
  pins.set(top, at);
  pins.set(bottom, at + 3);
  s.slack[i] = Math.min(1, Math.max(0, Number.isFinite(slack) ? slack : 1));
  s.frozen[i] = frozen ? 1 : 0;
  if (jumped) {
    s.started[i] = 1;
    straighten(s, i);
  }
  if (i >= s.count) s.count = i + 1;
}

function pinEnds(s: Strings, base: number, at: number, still: boolean): void {
  const { pos, prev, pins } = s;
  for (let k = 0; k < 3; k++) {
    pos[base + k] = read(pins, at + k);
    pos[base + SEGMENTS * 3 + k] = read(pins, at + 3 + k);
    if (still) {
      prev[base + k] = read(pins, at + k);
      prev[base + SEGMENTS * 3 + k] = read(pins, at + 3 + k);
    }
  }
}

function integrate(s: Strings, base: number, at: number, i: number, h: number): void {
  const { pos, prev, pins } = s;
  const dx = read(pins, at + 3) - read(pins, at);
  const dz = read(pins, at + 5) - read(pins, at + 2);
  const sway = SWAY_ACCEL * Math.sin(2 * Math.PI * SWAY_HZ * s.time + i * 1.7);
  const lateralX = -dz;
  const lateralZ = dx;
  const lateral = Math.sqrt(lateralX * lateralX + lateralZ * lateralZ) || 1;
  const swayX = (lateralX / lateral) * sway;
  const swayZ = (lateralZ / lateral) * sway;
  for (let p = 1; p < SEGMENTS; p++) {
    const o = base + p * 3;
    const x = read(pos, o);
    const y = read(pos, o + 1);
    const z = read(pos, o + 2);
    let mx = (x - read(prev, o)) * DAMPING + swayX * h * h;
    let my = (y - read(prev, o + 1)) * DAMPING + GRAVITY * h * h;
    let mz = (z - read(prev, o + 2)) * DAMPING + swayZ * h * h;
    const m = norm(mx, my, mz);
    if (m > MAX_STEP_M) {
      const k = MAX_STEP_M / m;
      mx *= k;
      my *= k;
      mz *= k;
    }
    prev[o] = x;
    prev[o + 1] = y;
    prev[o + 2] = z;
    pos[o] = x + mx;
    pos[o + 1] = y + my;
    pos[o + 2] = z + mz;
  }
}

function relax(s: Strings, base: number, at: number, rest: number): void {
  const pos = s.pos;
  for (let it = 0; it < ITERATIONS; it++) {
    pinEnds(s, base, at, false);
    for (let p = 0; p < SEGMENTS; p++) {
      const a = base + p * 3;
      const b = a + 3;
      const ex = read(pos, b) - read(pos, a);
      const ey = read(pos, b + 1) - read(pos, a + 1);
      const ez = read(pos, b + 2) - read(pos, a + 2);
      const length = norm(ex, ey, ez) || 1e-6;
      const error = (length - rest) / length;
      const wa = p === 0 ? 0 : 1;
      const wb = p === SEGMENTS - 1 ? 0 : 1;
      const total = wa + wb;
      pos[a] = read(pos, a) + (ex * error * wa) / total;
      pos[a + 1] = read(pos, a + 1) + (ey * error * wa) / total;
      pos[a + 2] = read(pos, a + 2) + (ez * error * wa) / total;
      pos[b] = read(pos, b) - (ex * error * wb) / total;
      pos[b + 1] = read(pos, b + 1) - (ey * error * wb) / total;
      pos[b + 2] = read(pos, b + 2) - (ez * error * wb) / total;
    }
  }
}

function stepOne(s: Strings, i: number, h: number): void {
  const base = i * POINTS * 3;
  const at = i * 6;
  if (s.frozen[i]) {
    pinEnds(s, base, at, true);
    return;
  }
  const { pins } = s;
  const length = norm(
    read(pins, at + 3) - read(pins, at),
    read(pins, at + 4) - read(pins, at + 1),
    read(pins, at + 5) - read(pins, at + 2),
  );
  const rest = (length / SEGMENTS) * (TAUT + (SLACK - TAUT) * read(s.slack, i));
  integrate(s, base, at, i, h);
  relax(s, base, at, rest);
  pinEnds(s, base, at, false);
  for (let n = 0; n < POINTS * 3; n++)
    if (!Number.isFinite(read(s.pos, base + n)) || !Number.isFinite(read(s.prev, base + n))) {
      straighten(s, i);
      return;
    }
}

/**
 * Returns how many steps ran (0 means the positions did not change and need not be uploaded again). A huge `dt` runs at
 * most `MAX_STEPS` steps and drops the rest, so a tab that was asleep for a minute costs the same as one frame.
 */
export function stepStrings(s: Strings, dt: number, hz: number): number {
  const h = 1 / Math.max(1, hz);
  s.carry += Math.min(MAX_DT_S, Math.max(0, Number.isFinite(dt) ? dt : 0));
  let steps = 0;
  while (s.carry >= h && steps < MAX_STEPS) {
    for (let i = 0; i < s.count; i++) if (s.started[i]) stepOne(s, i, h);
    s.time += h;
    s.carry -= h;
    steps++;
  }
  if (s.carry >= h) s.carry = 0;
  return steps;
}

export function checksum(s: Strings): number {
  let h = 2166136261;
  const n = s.count * POINTS * 3;
  for (let i = 0; i < n; i++) h = Math.imul(h ^ Math.round(read(s.pos, i) * 1000), 16777619);
  return h >>> 0;
}
