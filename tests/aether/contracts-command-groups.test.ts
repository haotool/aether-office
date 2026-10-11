import { randomUUID } from 'node:crypto';
import { describe, expect, it } from 'vitest';
import { collabCommands } from '../../packages/contracts/src/command-collab.js';
import {
  envelope,
  projectEnvelope,
  version,
} from '../../packages/contracts/src/command-envelope.js';
import { opsCommands } from '../../packages/contracts/src/command-ops.js';
import { workbenchCommands } from '../../packages/contracts/src/command-workbench.js';
import { id, shortText } from '../../packages/contracts/src/shared.js';

const GROUPS = [...workbenchCommands, ...collabCommands, ...opsCommands] as const;
type Schema = (typeof GROUPS)[number];
const schemaFor = (type: string): Schema => {
  const found = GROUPS.find((s) => s.shape.type.safeParse(type).success);
  if (!found) throw new Error(`no schema for ${type}`);
  return found;
};
const base = () => ({
  schemaVersion: 1 as const,
  idempotencyKey: 'key-12345678',
  correlationId: randomUUID(),
  projectId: randomUUID(),
});
const command = (type: string, data: unknown, extra: Record<string, unknown> = {}) => ({
  ...base(),
  type,
  data,
  ...extra,
});
const ok = (type: string, data: unknown, extra?: Record<string, unknown>) =>
  schemaFor(type).safeParse(command(type, data, extra)).success;

describe('shared building blocks', () => {
  it('accept a uuid for an id and a trimmed one-line label of at most 160 characters', () => {
    expect(id.safeParse(randomUUID()).success).toBe(true);
    expect(id.safeParse('not-a-uuid').success).toBe(false);
    expect(shortText.parse('  hello ')).toBe('hello');
    expect(shortText.safeParse('   ').success).toBe(false);
    expect(shortText.safeParse('x'.repeat(161)).success).toBe(false);
  });

  it('require schema version 1 and a usable idempotency key on every command', () => {
    expect(envelope.schemaVersion.safeParse(2).success).toBe(false);
    expect(envelope.idempotencyKey.safeParse('short').success).toBe(false);
    expect(envelope.idempotencyKey.safeParse('x'.repeat(101)).success).toBe(false);
    expect(Object.keys(projectEnvelope)).toContain('projectId');
    expect(version.safeParse(-1).success).toBe(false);
    expect(version.safeParse(1.5).success).toBe(false);
    expect(version.safeParse(0).success).toBe(true);
  });
});

describe('every command', () => {
  it('has one owner, so no type can be parsed by two schemas', () => {
    const owners = new Map<string, number>();
    for (const schema of GROUPS)
      for (const type of (schema.shape.type as { options?: string[]; value?: string }).options ?? [
        (schema.shape.type as { value?: string }).value!,
      ])
        owners.set(type, (owners.get(type) ?? 0) + 1);
    expect([...owners.values()].every((n) => n === 1)).toBe(true);
    expect(owners.size).toBeGreaterThanOrEqual(40);
  });

  it('refuses unknown top-level fields and a missing idempotency key', () => {
    const data = { reservationId: randomUUID() };
    expect(ok('reservation.release', data)).toBe(true);
    expect(ok('reservation.release', data, { surprise: true })).toBe(false);
    const { idempotencyKey: _dropped, ...withoutKey } = command('reservation.release', data);
    expect(schemaFor('reservation.release').safeParse(withoutKey).success).toBe(false);
  });
});

describe('workbench commands', () => {
  const terminal = () => ({ terminalId: randomUUID(), epoch: 3 });

  it('route takeover, release and stop through one shape', () => {
    for (const type of ['terminal.takeover', 'terminal.release', 'terminal.stop'])
      expect(ok(type, terminal()), type).toBe(true);
    expect(ok('terminal.stop', { ...terminal(), epoch: -1 })).toBe(false);
    expect(ok('terminal.stop', { terminalId: randomUUID() })).toBe(false);
  });

  it('bound the text typed into a terminal', () => {
    expect(ok('terminal.input', { ...terminal(), text: 'ls\r' })).toBe(true);
    expect(ok('terminal.input', { ...terminal(), text: '' })).toBe(false);
    expect(ok('terminal.input', { ...terminal(), text: 'x'.repeat(8193) })).toBe(false);
    expect(ok('terminal.input', { ...terminal(), text: 'x'.repeat(8192) })).toBe(true);
  });

  it('do not let a data field smuggle extra keys in', () => {
    expect(ok('terminal.input', { ...terminal(), text: 'a', admin: true })).toBe(false);
  });
});

describe('collaboration commands', () => {
  const body = 'please review';

  it('send a message to recipients or to a room, never both and never neither', () => {
    expect(ok('message.send', { recipients: [randomUUID()], body })).toBe(true);
    expect(ok('message.send', { roomId: randomUUID(), body })).toBe(true);
    expect(ok('message.send', { body })).toBe(false);
    expect(ok('message.send', { recipients: [randomUUID()], roomId: randomUUID(), body })).toBe(
      false,
    );
  });

  it('bound a message: kind, size and lifetime', () => {
    const to = { recipients: [randomUUID()] };
    expect(ok('message.send', { ...to, body, kind: 'handoff' })).toBe(true);
    expect(ok('message.send', { ...to, body, kind: 'shout' })).toBe(false);
    expect(ok('message.send', { ...to, body: '   ' })).toBe(false);
    expect(ok('message.send', { ...to, body: 'x'.repeat(16001) })).toBe(false);
    expect(ok('message.send', { ...to, body, ttlMs: 999 })).toBe(false);
    expect(
      schemaFor('message.send').parse(command('message.send', { ...to, body })).data,
    ).toMatchObject({
      kind: 'inform',
      ttlMs: 86_400_000,
    });
  });

  it('decide an approval only against the exact action hash that was shown', () => {
    const decision = { approvalId: randomUUID(), actionHash: 'a'.repeat(64), decision: 'approve' };
    expect(ok('approval.decide', decision, { expectedVersion: 2 })).toBe(true);
    expect(ok('approval.decide', decision)).toBe(false);
    expect(
      ok('approval.decide', { ...decision, actionHash: 'A'.repeat(64) }, { expectedVersion: 2 }),
    ).toBe(false);
    expect(ok('approval.decide', { ...decision, decision: 'maybe' }, { expectedVersion: 2 })).toBe(
      false,
    );
  });
});

describe('operations commands', () => {
  const invite = { name: 'laptop', providers: ['claude'], roots: ['/work'] };

  it('invite a machine with bounded lifetime, concurrency and roots, and defaults for the rest', () => {
    const parsed = schemaFor('machine.invite').parse(command('machine.invite', invite));
    expect(parsed.data).toMatchObject({ ttlSec: 600, concurrency: 1 });
    expect(ok('machine.invite', { ...invite, ttlSec: 59 })).toBe(false);
    expect(ok('machine.invite', { ...invite, ttlSec: 901 })).toBe(false);
    expect(ok('machine.invite', { ...invite, concurrency: 5 })).toBe(false);
    expect(ok('machine.invite', { ...invite, providers: [] })).toBe(false);
    expect(ok('machine.invite', { ...invite, providers: ['gpt'] })).toBe(false);
    expect(ok('machine.invite', { ...invite, roots: [] })).toBe(false);
  });

  it('connect an integration by the name of an environment variable, never by a token value', () => {
    const github = {
      provider: 'github',
      owner: 'haotool',
      repo: 'aether',
      tokenEnv: 'GITHUB_TOKEN',
    };
    expect(ok('integration.connect', github)).toBe(true);
    expect(ok('integration.connect', { ...github, tokenEnv: 'ghp_realtoken123' })).toBe(false);
    expect(ok('integration.connect', { ...github, owner: '-bad' })).toBe(false);
    expect(ok('integration.connect', { ...github, repo: 'a/b' })).toBe(false);
    expect(
      ok('integration.connect', { provider: 'linear', teamKey: 'ENG', tokenEnv: 'LINEAR_KEY' }),
    ).toBe(true);
    expect(
      ok('integration.connect', { provider: 'linear', owner: 'x', tokenEnv: 'LINEAR_KEY' }),
    ).toBe(false);
    expect(ok('integration.connect', { provider: 'gitlab', tokenEnv: 'TOKEN' })).toBe(false);
  });

  it('integrate only onto a named base at an exact 40-character commit', () => {
    const data = { workId: randomUUID(), baseBranch: 'main', expectedBase: 'a'.repeat(40) };
    expect(ok('work.integrate', data, { expectedVersion: 1 })).toBe(true);
    expect(ok('work.integrate', { ...data, expectedBase: 'abc' }, { expectedVersion: 1 })).toBe(
      false,
    );
    expect(ok('work.integrate', { ...data, baseBranch: 'a b' }, { expectedVersion: 1 })).toBe(
      false,
    );
  });

  it('pin a review comment to a commit, a hunk and a bounded body', () => {
    const data = {
      workId: randomUUID(),
      headSha: 'b'.repeat(40),
      path: 'src/a.ts',
      hunkHash: 'c'.repeat(64),
      line: 12,
      body: 'rename this',
    };
    expect(ok('work.comment', data)).toBe(true);
    expect(ok('work.comment', { ...data, line: 0 })).toBe(false);
    expect(ok('work.comment', { ...data, body: '' })).toBe(false);
    expect(ok('work.comment', { ...data, hunkHash: 'c'.repeat(40) })).toBe(false);
  });

  it('hold file reservations for a bounded time', () => {
    expect(ok('reservation.acquire', { patterns: ['src/**'] })).toBe(true);
    expect(ok('reservation.acquire', { patterns: [] })).toBe(false);
    expect(ok('reservation.acquire', { patterns: ['a'], ttlSec: 29 })).toBe(false);
    expect(ok('reservation.acquire', { patterns: ['a'], ttlSec: 3601 })).toBe(false);
    expect(ok('reservation.renew', { reservationId: randomUUID(), ttlSec: 60 })).toBe(true);
  });
});
