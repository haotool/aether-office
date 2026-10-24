import { describe, expect, it } from 'vitest';
import {
  POSE_HOLD_MS,
  POSE_PRIORITY,
  admitPose,
  emptyPoseGate,
  turnWeight,
  type PoseGate,
  type PoseRequest,
} from '../../packages/office-scene/src/core/pose-cues.js';

const ask = (source: PoseRequest['source'], clip: PoseRequest['clip'] = 'nod'): PoseRequest => ({
  member: 'a',
  source,
  clip,
});
const play = (gate: PoseGate, request: PoseRequest, now: number, reduced = false) => {
  const verdict = admitPose(gate, request, now, reduced);
  return verdict.ok ? verdict.gate : null;
};

describe('pose priorities', () => {
  it('ranks the person above a hand-over', () => {
    expect(POSE_PRIORITY.emote).toBeGreaterThan(POSE_PRIORITY.handover);
  });

  it('lets a higher source take over a pose still playing, never the other way round', () => {
    const handover = play(emptyPoseGate, ask('handover'), 0)!;
    expect(admitPose(handover, ask('emote', 'wave'), 100, false).ok).toBe(true);
    const emote = play(emptyPoseGate, ask('emote'), 0)!;
    expect(admitPose(emote, ask('handover'), 100, false).ok).toBe(false);
  });

  it('keeps an equal source out while one is playing, and lets it in afterwards', () => {
    const gate = play(emptyPoseGate, ask('handover'), 0)!;
    expect(admitPose(gate, ask('handover'), POSE_HOLD_MS - 1, false).ok).toBe(false);
    expect(admitPose(gate, ask('handover'), POSE_HOLD_MS, false).ok).toBe(true);
  });

  it('lets a hand-over nod a supervisor whom the person made emote earlier (the old `emote ?? squad` merge never did)', () => {
    const gate = play(emptyPoseGate, ask('emote', 'wave'), 0)!;
    expect(admitPose(gate, ask('handover', 'nod'), POSE_HOLD_MS + 1, false).ok).toBe(true);
  });

  it('is per member', () => {
    const gate = play(emptyPoseGate, ask('emote'), 0)!;
    expect(admitPose(gate, { ...ask('handover'), member: 'b' }, 10, false).ok).toBe(true);
  });
});

describe('pose holds', () => {
  it('plays nothing with reduced motion, from any source', () => {
    for (const source of ['emote', 'handover'] as const)
      expect(admitPose(emptyPoseGate, ask(source), 0, true)).toEqual({
        ok: false,
        reason: 'reduced-motion',
      });
  });

  it('holds a turn for as long as it asks', () => {
    const turn = { member: 'a', source: 'handover', turn: { yaw: -0.4, holdMs: 6000 } } as const;
    const gate = play(emptyPoseGate, turn, 0)!;
    expect(admitPose(gate, ask('handover'), 5000, false).ok).toBe(false);
    expect(admitPose(gate, ask('emote'), 5000, false).ok).toBe(true);
  });
});

describe('turnWeight', () => {
  it('eases in, holds and eases out, and is zero outside', () => {
    expect(turnWeight(-1, 1000)).toBe(0);
    expect(turnWeight(250, 1000)).toBeCloseTo(0.5);
    expect(turnWeight(700, 1000)).toBe(1);
    expect(turnWeight(1350, 1000)).toBeCloseTo(0.5);
    expect(turnWeight(1701, 1000)).toBe(0);
  });
});
