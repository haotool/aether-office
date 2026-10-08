import { describe, expect, it } from 'vitest';
import {
  BEAM_REFERENCE,
  beamIntensity,
  beamRate,
  squadTokenRate,
} from '../../packages/office-scene/src/squad/beam-rate.js';
import { beamBasis, beamReadout } from '../../packages/office-scene/src/squad/beam-readout.js';
import {
  EMPTY_SQUAD,
  stepSquad,
  type SquadInput,
  type SquadMemberInput,
  type SquadState,
} from '../../packages/office-scene/src/squad/squad-model.js';
import { zoneName } from '../../packages/office-scene/src/squad/squad-text.js';
import { squadsOf } from '../../apps/web/src/features/office/office-model.js';
import type { AttributedSession } from '../../packages/contracts/src/index.js';

const SUP = 'local:s1';
const T0 = 1_000_000;
const member = (n: number, over: Partial<SquadMemberInput> = {}): SquadMemberInput => ({
  id: `${SUP}:sub:a${n}`,
  type: 'Explore',
  status: 'running',
  startedAt: T0,
  lastSeen: T0,
  toolCount: 0,
  ...over,
});
const step = (members: SquadMemberInput[], now: number, prev: SquadState = EMPTY_SQUAD) =>
  stepSquad(
    prev,
    { squads: [{ supervisor: SUP, members } as SquadInput], leaveMs: () => 8000 },
    now,
  );

describe('the squad token rate', () => {
  it('is the sum over working members that have a sample, and null when none has one (not known, never zero)', () => {
    expect(squadTokenRate([member(1), member(2)])).toBeNull();
    expect(squadTokenRate([member(1, { tokensPerMinute: 4000 }), member(2)])).toBe(4000);
    expect(
      squadTokenRate([member(1, { tokensPerMinute: 4000 }), member(2, { tokensPerMinute: 8000 })]),
    ).toBe(12_000);
    expect(squadTokenRate([member(1, { tokensPerMinute: 0 })])).toBe(0); // measured, and nothing spent
    expect(
      squadTokenRate([member(1, { tokensPerMinute: 9000, status: 'finished' }), member(2)]),
    ).toBeNull();
  });

  it('reaches the zone, and the beam uses it with its unit, falling back to tool calls', () => {
    const withTokens = step([member(1, { tokensPerMinute: 12_000 })], T0 + 1000);
    expect(beamRate(withTokens.zones[SUP], T0 + 1000)).toEqual({
      source: 'tokens',
      perMinute: 12_000,
    });
    const noTokens = step([member(1)], T0 + 1000);
    expect(beamRate(noTokens.zones[SUP], T0 + 1000).source).toBe('tools');
    const notYet = step([member(1, { tokensPerMinute: 0 })], T0 + 1000);
    expect(beamRate(notYet.zones[SUP], T0 + 1000).source).toBe('tools'); // 0 = no second sample yet
    expect(beamRate(undefined, T0)).toEqual({ source: 'tools', perMinute: 0 });
  });

  it('follows the tool starts of the last minute when the squad has no tokens', () => {
    let state = step([member(1, { toolCount: 1 })], T0);
    state = step([member(1, { toolCount: 3, lastSeen: T0 + 4000 })], T0 + 4000, state);
    expect(beamRate(state.zones[SUP], T0 + 4000)).toEqual({ source: 'tools', perMinute: 1 });
    expect(beamRate(state.zones[SUP], T0 + 70_000).perMinute).toBe(0);
  });
});

describe('the brightness curve', () => {
  const at = (source: 'tokens' | 'tools', perMinute: number) =>
    beamIntensity({ source, perMinute });

  it('is 0 for no work, monotonic, smooth and saturating: about 0.9 at the reference rate, never clipped to 1', () => {
    for (const source of ['tokens', 'tools'] as const) {
      expect(at(source, 0)).toBe(0);
      expect(at(source, -5)).toBe(0);
      expect(at(source, BEAM_REFERENCE[source])).toBeCloseTo(0.905, 2);
      let last = -1;
      for (let r = 0; r <= BEAM_REFERENCE[source] * 40; r = r * 1.2 + 1) {
        const level = at(source, r);
        expect(level).toBeGreaterThan(last);
        expect(level).toBeLessThanOrEqual(1);
        last = level;
      }
      expect(at(source, BEAM_REFERENCE[source] * 1000)).toBeLessThan(1.0000001);
      // no kink at the reference: the slope just before and after differ by little
      const ref = BEAM_REFERENCE[source];
      const before = at(source, ref) - at(source, ref * 0.9);
      const after = at(source, ref * 1.1) - at(source, ref);
      expect(after / before).toBeGreaterThan(0.4);
    }
  });

  it('reads a handful of calls and a dozen thousand tokens as visible work', () => {
    expect(at('tokens', 12_000)).toBeGreaterThan(0.65);
    expect(at('tokens', 1_000)).toBeGreaterThan(0.5);
    expect(at('tools', 1)).toBeGreaterThan(0.2);
    expect(at('tools', 12)).toBeGreaterThan(0.7);
  });
});

describe('the readout words', () => {
  it('says the unit and the basis, in both languages, and nothing while idle', () => {
    expect(beamReadout(false, { source: 'tokens', perMinute: 12_000 })).toBe('~12K tokens/min');
    expect(beamReadout(false, { source: 'tools', perMinute: 8 })).toBe('~8 tool calls/min');
    expect(beamBasis(false, { source: 'tokens', perMinute: 12_000 })).toBe(
      '~12K tokens/min (based on tokens)',
    );
    expect(beamBasis(false, { source: 'tools', perMinute: 8 })).toBe(
      '~8 tool calls/min (based on tool calls)',
    );
    expect(beamBasis(true, { source: 'tokens', perMinute: 12_000 })).toBe(
      '約 1.2萬 tokens/分鐘（依 token 用量）',
    );
    expect(beamBasis(true, { source: 'tools', perMinute: 8 })).toBe(
      '約 8 次工具呼叫/分鐘（依工具呼叫次數）',
    );
    expect(beamReadout(false, { source: 'tokens', perMinute: 0.2 })).toBeNull();
    expect(beamBasis(true, { source: 'tools', perMinute: 0 })).toBeNull();
  });

  it('never words a tool-call rate as tokens or the other way round', () => {
    for (const zh of [false, true]) {
      expect(beamBasis(zh, { source: 'tools', perMinute: 30 })).not.toMatch(/token/i);
      expect(beamBasis(zh, { source: 'tokens', perMinute: 3000 })).not.toMatch(/tool call|工具/);
    }
  });

  it("is part of the zone label's accessible name", () => {
    expect(zoneName(false, 'main', 3, 0)).toBe('Squad of main, 3 working');
    expect(zoneName(false, 'main', 3, 0, '~12K tokens/min (based on tokens)')).toBe(
      'Squad of main, 3 working, ~12K tokens/min (based on tokens)',
    );
    expect(zoneName(true, 'main', 3, 2, '約 8 次工具呼叫/分鐘（依工具呼叫次數）')).toBe(
      'main 的小隊，3 位運作中，另有 2 位，約 8 次工具呼叫/分鐘（依工具呼叫次數）',
    );
  });
});

describe('the page feeds the beam from the subagent tokens', () => {
  const session = (tokens: { total: number; perMinute: number; sampledAt: number } | null) =>
    ({
      key: 's1',
      subagents: [
        {
          id: 'a1',
          type: 'Explore',
          lastSeen: T0,
          source: 'transcript',
          status: 'running',
          startedAt: T0,
          endedAt: null,
          nickname: null,
          tools: { count: 3, last: 'Read', lastAt: T0 },
          label: null,
          tokens,
          result: null,
        },
      ],
    }) as unknown as AttributedSession;

  it('carries tokens.perMinute into the squad member, and null when the file gives no tokens', () => {
    const rate = (s: AttributedSession) => squadsOf([s])[0]!.members[0]!.tokensPerMinute;
    expect(rate(session({ total: 90_000, perMinute: 12_000, sampledAt: T0 }))).toBe(12_000);
    expect(rate(session(null))).toBeNull();
  });
});
