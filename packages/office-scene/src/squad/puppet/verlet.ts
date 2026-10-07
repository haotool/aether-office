// The puppet strings' simulation: every string of the scene is six points in one pooled Float32Array, pinned at both ends
// and relaxed with a fixed-step Verlet integrator. Pure maths on typed arrays (no three.js): the same pins and the same
// sequence of `dt` always give the same points, and no input (a huge `dt`, a teleporting pin, a NaN) can make it blow up.

/** Points on a string (two pinned: the cross and the anchor on the body) and the segments between them. */
export const POINTS = 6;
export const SEGMENTS = POINTS - 1;
/** The rest length of a segment as a share of the straight distance: taut while it works, slack when it is quiet. */
const TAUT = 0.98;
const SLACK = 1.15;
const DAMPING = 0.965;
/** Light strings: a sixth of gravity. */
const GRAVITY = -9.8 * 0.15;
const ITERATIONS = 3;
/** A gentle sway (0.25 Hz) across the string, in m/s^2. */
const SWAY_HZ = 0.25;
const SWAY_ACCEL = 0.55;
/** The longest a pin may move between two steps before the string is laid straight again (a teleport, a zone that jumped). */
export const TELEPORT_M = 2.5;
/** The most any point may move in one step: whatever the input, a point never flies off. */
const MAX_STEP_M = 0.3;
/** Time one `stepStrings` call may catch up on, and the most steps it takes for it: a stalled tab does not owe a burst. */
const MAX_DT_S = 0.25;
const MAX_STEPS = 4;

export type Strings = {
  readonly capacity: number;
  /** Strings in use (the first `count`). */
  count: number;
  /** Current and previous positions: POINTS x 3 floats per string. */
  readonly pos: Float32Array;
  readonly prev: Float32Array;
  /** The pins as last set: top then bottom, 6 floats per string. */
  readonly pins: Float32Array;
  /** 0 taut to 1 slack, per string. */
  readonly slack: Float32Array;
  /** 1 when the string holds still (a subagent waiting for a person): its pins follow, nothing else moves. */
  readonly frozen: Uint8Array;
  /** 0 until the string was first pinned (then it starts straight). */
  readonly started: Uint8Array;
  /** Seconds of simulated time, for the sway; and what is left of the last `dt` after whole steps. */
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

/** Lays string `i` straight between its pins, at rest. */
export function straighten(s: Strings, i: number): void {
  const base = i * POINTS * 3;
  for (let p = 0; p < POINTS; p++) {
    const t = p / SEGMENTS;
    for (let k = 0; k < 3; k++) {
      const v = s.pins[i * 6 + k]! + (s.pins[i * 6 + 3 + k]! - s.pins[i * 6 + k]!) * t;
      s.pos[base + p * 3 + k] = v;
      s.prev[base + p * 3 + k] = v;
    }
  }
}

/** The length of a vector: `Math.hypot` is several times slower and this runs thousands of times a frame. */
const norm = (x: number, y: number, z: number) => Math.sqrt(x * x + y * y + z * z);

const finite = (v: Vec3) => Number.isFinite(v[0] + v[1] + v[2]);

/**
 * Sets the pins of string `i` for the next step: the top (the cross) and the bottom (the head or a hand), how slack the
 * string is, and whether it holds still. A string pinned for the first time, or whose pin jumped farther than a
 * teleport, or given a pin that is not a number, starts straight again instead of snapping like a whip.
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
  const jumped =
    !s.started[i] ||
    norm(top[0] - s.pins[at]!, top[1] - s.pins[at + 1]!, top[2] - s.pins[at + 2]!) > TELEPORT_M ||
    norm(bottom[0] - s.pins[at + 3]!, bottom[1] - s.pins[at + 4]!, bottom[2] - s.pins[at + 5]!) >
      TELEPORT_M;
  s.pins.set(top, at);
  s.pins.set(bottom, at + 3);
  s.slack[i] = Math.min(1, Math.max(0, Number.isFinite(slack) ? slack : 1));
  s.frozen[i] = frozen ? 1 : 0;
  if (jumped) {
    s.started[i] = 1;
    straighten(s, i);
  }
  if (i >= s.count) s.count = i + 1;
}

/** One fixed step of `h` seconds on string `i`. */
function stepOne(s: Strings, i: number, h: number): void {
  const base = i * POINTS * 3;
  const pos = s.pos;
  const prev = s.prev;
  const at = i * 6;
  if (s.frozen[i]) {
    // Held: the ends follow their pins, the rest keeps its shape, shifted with them.
    for (let k = 0; k < 3; k++) {
      pos[base + k] = s.pins[at + k]!;
      prev[base + k] = s.pins[at + k]!;
      pos[base + SEGMENTS * 3 + k] = s.pins[at + 3 + k]!;
      prev[base + SEGMENTS * 3 + k] = s.pins[at + 3 + k]!;
    }
    return;
  }
  const dx = s.pins[at + 3]! - s.pins[at]!;
  const dy = s.pins[at + 4]! - s.pins[at + 1]!;
  const dz = s.pins[at + 5]! - s.pins[at + 2]!;
  const rest = (norm(dx, dy, dz) / SEGMENTS) * (TAUT + (SLACK - TAUT) * s.slack[i]!);
  const sway = SWAY_ACCEL * Math.sin(2 * Math.PI * SWAY_HZ * s.time + i * 1.7);
  const lateralX = -dz;
  const lateralZ = dx;
  const lateral = Math.sqrt(lateralX * lateralX + lateralZ * lateralZ) || 1;
  const swayX = (lateralX / lateral) * sway;
  const swayZ = (lateralZ / lateral) * sway;
  for (let p = 1; p < SEGMENTS; p++) {
    const o = base + p * 3;
    const ax = swayX;
    const ay = GRAVITY;
    const az = swayZ;
    let mx = (pos[o]! - prev[o]!) * DAMPING + ax * h * h;
    let my = (pos[o + 1]! - prev[o + 1]!) * DAMPING + ay * h * h;
    let mz = (pos[o + 2]! - prev[o + 2]!) * DAMPING + az * h * h;
    const m = norm(mx, my, mz);
    if (m > MAX_STEP_M) {
      const k = MAX_STEP_M / m;
      mx *= k;
      my *= k;
      mz *= k;
    }
    prev[o] = pos[o]!;
    prev[o + 1] = pos[o + 1]!;
    prev[o + 2] = pos[o + 2]!;
    pos[o] = pos[o]! + mx;
    pos[o + 1] = pos[o + 1]! + my;
    pos[o + 2] = pos[o + 2]! + mz;
  }
  for (let it = 0; it < ITERATIONS; it++) {
    for (let k = 0; k < 3; k++) {
      pos[base + k] = s.pins[at + k]!;
      pos[base + SEGMENTS * 3 + k] = s.pins[at + 3 + k]!;
    }
    for (let p = 0; p < SEGMENTS; p++) {
      const a = base + p * 3;
      const b = a + 3;
      const ex = pos[b]! - pos[a]!;
      const ey = pos[b + 1]! - pos[a + 1]!;
      const ez = pos[b + 2]! - pos[a + 2]!;
      const length = norm(ex, ey, ez) || 1e-6;
      // A taut string is shorter than the way between its pins: the pins hold it, the free points share the error.
      const error = (length - rest) / length;
      const wa = p === 0 ? 0 : 1;
      const wb = p === SEGMENTS - 1 ? 0 : 1;
      const total = wa + wb;
      pos[a] = pos[a]! + (ex * error * wa) / total;
      pos[a + 1] = pos[a + 1]! + (ey * error * wa) / total;
      pos[a + 2] = pos[a + 2]! + (ez * error * wa) / total;
      pos[b] = pos[b]! - (ex * error * wb) / total;
      pos[b + 1] = pos[b + 1]! - (ey * error * wb) / total;
      pos[b + 2] = pos[b + 2]! - (ez * error * wb) / total;
    }
  }
  for (let k = 0; k < 3; k++) {
    pos[base + k] = s.pins[at + k]!;
    pos[base + SEGMENTS * 3 + k] = s.pins[at + 3 + k]!;
  }
  for (let n = 0; n < POINTS * 3; n++)
    if (!Number.isFinite(pos[base + n]!) || !Number.isFinite(prev[base + n]!)) {
      straighten(s, i);
      return;
    }
}

/**
 * Advances every string by `dt` seconds in whole steps of `1 / hz`: the rest of `dt` is carried over. Returns how many
 * steps ran (0 means the positions did not change and need not be uploaded again). A huge `dt` runs at most
 * `MAX_STEPS` steps and drops the rest, so a tab that was asleep for a minute costs the same as one frame.
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
  if (s.carry >= h) s.carry = 0; // the rest is dropped, not owed
  return steps;
}

/** A short number that changes when any point of the first `count` strings moves (rounded to a millimetre): the golden checksum. */
export function checksum(s: Strings): number {
  let h = 2166136261;
  const n = s.count * POINTS * 3;
  for (let i = 0; i < n; i++) h = Math.imul(h ^ Math.round(s.pos[i]! * 1000), 16777619);
  return h >>> 0;
}
