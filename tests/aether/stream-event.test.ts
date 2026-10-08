import { expect, it } from 'vitest';
import { isDomainEvent } from '../../apps/web/src/lib/sessions/stream-event.js';

it('accepts a domain event and refuses anything malformed', () => {
  expect(isDomainEvent(JSON.stringify({ seq: '12', type: 'agent.updated' }))).toBe(true);
  expect(isDomainEvent(JSON.stringify({ seq: 12, type: 'agent.updated' }))).toBe(false);
  expect(isDomainEvent(JSON.stringify({ seq: '12', type: 'Agent' }))).toBe(false);
  expect(isDomainEvent('null')).toBe(false);
  expect(isDomainEvent('not json')).toBe(false);
});
