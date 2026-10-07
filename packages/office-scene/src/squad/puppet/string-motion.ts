// What one subagent's strings are doing, from what the subagent is doing: taut while it works, a jerk when it starts a
// tool (the hook's PreToolUse time changes), slack and then gone when it is quiet or has finished, frozen when it waits
// for a person. Pure; the layer adds the clock.

/** The look of a subagent for its strings. */
export type StringPhase = 'working' | 'waiting' | 'idle' | 'finished';

export type StringMotion = {
  /** 0 taut to 1 slack. */
  slack: number;
  /** 0 invisible to 1: the strings fade out after they went slack. */
  alpha: number;
  /** The cross's dip (metres, negative is down) and its speed: a critically damped spring back to 0. */
  dip: number;
  dipSpeed: number;
  /** The last tool start seen; a later one is a jerk. */
  toolAt: number | null;
};

/** The slack eases over one second; strings reappear in half of one and fade away over the time below. */
const SLACK_EASE_S = 1;
const FADE_IN_S = 0.5;
const FADE_OUT_S = { idle: 6, finished: 2.5 } as const;
/** A jerk: the cross dips 4 cm and settles in about 250 ms (omega 18 rad/s, critically damped). */
export const JERK_DIP_M = -0.04;
const OMEGA = 18;
/** The hand string's anchor lifts 1.5 times what the cross dips (6 cm). */
export const HAND_LIFT = -1.5;
/** The most time one step integrates: a stalled frame does not make the spring explode. */
const MAX_DT_S = 0.05;

export const calmMotion = (toolAt: number | null): StringMotion => ({
  slack: 1,
  alpha: 0,
  dip: 0,
  dipSpeed: 0,
  toolAt,
});

const toward = (value: number, target: number, rate: number) =>
  value < target ? Math.min(target, value + rate) : Math.max(target, value - rate);

/** The next motion of a subagent's strings, `dt` seconds on. */
export function stepMotion(
  m: StringMotion,
  input: { phase: StringPhase; toolAt: number | null },
  dt: number,
): StringMotion {
  const h = Math.min(MAX_DT_S, Math.max(0, Number.isFinite(dt) ? dt : 0));
  const jerk = m.toolAt !== null && input.toolAt !== null && input.toolAt > m.toolAt;
  const toolAt = input.toolAt ?? m.toolAt;
  if (input.phase === 'waiting')
    // Frozen: nothing moves, nothing fades, and a tool start does not jerk what is held still.
    return {
      ...m,
      slack: toward(m.slack, 0, h / SLACK_EASE_S),
      alpha: toward(m.alpha, 1, h / FADE_IN_S),
      toolAt,
    };
  const awake = input.phase === 'working';
  const alphaRate = awake ? 1 / FADE_IN_S : 1 / FADE_OUT_S[input.phase as 'idle' | 'finished'];
  let dip = jerk ? JERK_DIP_M : m.dip;
  let dipSpeed = jerk ? 0 : m.dipSpeed;
  dipSpeed += (-OMEGA * OMEGA * dip - 2 * OMEGA * dipSpeed) * h;
  dip += dipSpeed * h;
  if (Math.abs(dip) < 1e-4 && Math.abs(dipSpeed) < 1e-3) {
    dip = 0;
    dipSpeed = 0;
  }
  return {
    slack: toward(m.slack, awake ? 0 : 1, h / SLACK_EASE_S),
    alpha: toward(m.alpha, awake ? 1 : 0, h * alphaRate),
    dip,
    dipSpeed,
    toolAt,
  };
}

/** Whether the strings of a motion are worth drawing at all. */
export const visible = (m: StringMotion) => m.alpha > 0.01;
