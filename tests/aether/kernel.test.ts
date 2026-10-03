import { describe, expect, it } from 'vitest';
import {
  assertAcyclic,
  assertOwnedAgent,
  assertTransition,
  assertVersion,
  authorize,
  nextOccurrence,
  usageDelta,
} from '../../packages/kernel/src/index.js';

describe('domain invariants', () => {
  it('refuses task completion without review and verification, and late success after cancellation', () => {
    expect(() => assertTransition('running', 'completed')).toThrow('INVALID_TRANSITION');
    expect(() => assertTransition('cancel_requested', 'reviewing')).toThrow('INVALID_TRANSITION');
    assertTransition('running', 'reviewing');
    assertTransition('reviewing', 'verified');
    assertTransition('verified', 'completed');
  });
  it('rejects missing dependencies, self-reference, cycles and duplicate edges', () => {
    const graph = new Map([
      ['a', ['b']],
      ['b', []],
    ]);
    expect(() => assertAcyclic('b', ['a'], graph)).toThrow('DAG_CYCLE');
    expect(() => assertAcyclic('c', ['c'], graph)).toThrow('DAG_CYCLE');
    expect(() => assertAcyclic('c', ['foreign'], graph)).toThrow('DEPENDENCY_NOT_FOUND');
    expect(() => assertAcyclic('c', ['a', 'a'], graph)).toThrow('DUPLICATE_DEPENDENCY');
    assertAcyclic('c', ['a'], graph);
  });
  it('enforces grants, project scope, actor identity and optimistic concurrency', () => {
    const actor = { id: 'x', role: 'agent' as const, projectIds: ['p'], agentId: 'a' };
    authorize(actor, 'message.send', 'p');
    expect(() => authorize(actor, 'approval.decide', 'p')).toThrow('FORBIDDEN');
    expect(() => authorize(actor, 'read', 'q')).toThrow('PROJECT_FORBIDDEN');
    expect(() => assertOwnedAgent(actor, 'b')).toThrow('RECIPIENT_FORBIDDEN');
    expect(() => assertVersion(2, 1)).toThrow('VERSION_CONFLICT');
  });
  it('usage replay never charges duplicate cumulative usage', () => {
    expect(usageDelta({ input: 50, output: 20 }, { input: 50, output: 20 })).toEqual({
      input: 0,
      output: 0,
    });
    expect(usageDelta({ input: 50, output: 20 }, { input: 60, output: 30 })).toEqual({
      input: 10,
      output: 10,
    });
    expect(() => usageDelta({ input: 0, output: 0 }, { input: NaN, output: 0 })).toThrow(
      'INVALID_USAGE',
    );
  });
  it('missed schedules catch up once, not once per missed occurrence', () => {
    expect(nextOccurrence(0, 3600000, 60000, 'single')).toEqual({
      dispatch: true,
      nextAt: 3660000,
    });
    expect(nextOccurrence(0, 3600000, 60000, 'skip')).toEqual({ dispatch: false, nextAt: 3660000 });
    expect(nextOccurrence(3660000, 3600000, 60000, 'single').dispatch).toBe(false);
  });
});
