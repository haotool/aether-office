import { expect, it } from 'vitest';
import { needsYou } from '../../apps/web/src/features/needs-you.js';
import type { Snapshot } from '../../packages/contracts/src/index.js';

const snapshot = {
  work: ['ready', 'reviewing', 'verified', 'running', 'failed', 'completed'].map((state) => ({
    state,
  })),
  messages: [
    { kind: 'request', deliveries: [{ acknowledgedAt: null }] },
    { kind: 'request', deliveries: [{ acknowledgedAt: 5 }] },
    { kind: 'inform', deliveries: [{ acknowledgedAt: null }] },
  ],
} as unknown as Snapshot;

it('counts what waits for a person, not how much there is', () => {
  expect(needsYou(snapshot, 2, 4)).toEqual({ tasks: 3, messages: 1, approvals: 2, sessions: 4 });
  expect(needsYou(undefined, 0, 0)).toEqual({ tasks: 0, messages: 0, approvals: 0, sessions: 0 });
});
