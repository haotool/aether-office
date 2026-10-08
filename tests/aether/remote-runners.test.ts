import { spawn, type ChildProcess } from 'node:child_process';
import { mkdtempSync, readFileSync, rmSync, statSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { setTimeout as delay } from 'node:timers/promises';
import { afterAll, beforeAll, expect, it } from 'vitest';
import { createServer } from '../../apps/control/src/server.js';
import { revoke } from '../../apps/control/src/services/domain/identity.js';
import { enrollRunner } from '../../apps/runner/src/enroll.js';
import { assertSecureControlUrl } from '../../apps/runner/src/transport.js';
import { command, fixture } from './fixture.js';
import { freePort } from './timing.js';

let PORT = 0;
let URL_BASE = '';
const children: ChildProcess[] = [];

// A deadline for a runner process to start (tsx compiles on the way) and answer: only a hang reaches it.
async function until<T>(read: () => T | undefined | false, ms = 60000): Promise<T> {
  for (const end = Date.now() + ms; Date.now() < end; await delay(100)) {
    const value = read();
    if (value) return value;
  }
  throw new Error('TIMED_OUT_WAITING');
}

const launch = (directory: string): ChildProcess => {
  const child = spawn(process.execPath, ['--import', 'tsx', 'apps/runner/src/main.ts'], {
    env: {
      PATH: process.env['PATH'] ?? '',
      AETHER_MODE: 'demo',
      AETHER_DATA_DIR: directory,
      AETHER_CONTROL_URL: URL_BASE,
    },
    stdio: 'ignore',
  });
  children.push(child);
  return child;
};

let directory: string;
beforeAll(async () => {
  PORT = await freePort();
  URL_BASE = `http://127.0.0.1:${PORT}`;
  directory = mkdtempSync(join(tmpdir(), 'aether-remote-'));
});
// One hook, in this order (hooks run in reverse): the runners are gone before their directory is, or they write into it
// while it is being removed (ENOTEMPTY).
afterAll(async () => {
  await Promise.all(
    children.map(
      (child) =>
        new Promise<void>((done) => {
          if (child.exitCode !== null || child.signalCode !== null) return done();
          child.once('exit', () => done());
          child.kill('SIGKILL');
        }),
    ),
  );
  rmSync(directory, { recursive: true, force: true, maxRetries: 5, retryDelay: 100 });
});

it('enrolls two independent runner processes by single-use invitation and keeps their scopes apart', async () => {
  const f = fixture(join(directory, 'control.sqlite'));
  let app = createServer(f.control, { origin: URL_BASE });
  await app.listen({ host: '127.0.0.1', port: PORT });
  try {
    const owner = (type: string, data: unknown, projectId?: string, version?: number) =>
      f.control.execute(f.owner.actor, command(type, data, projectId, version));
    const second = String(owner('project.create', { name: 'Second project' }).result['id']);
    const agentTwo = String(
      owner(
        'agent.register',
        { name: 'Two', role: 'Engineer', provider: 'demo', species: 'cat', color: '#aabbcc' },
        second,
      ).result['id'],
    );
    const invite = (projectId: string, name: string) =>
      owner(
        'machine.invite',
        { name, providers: ['demo'], roots: [directory], concurrency: 1 },
        projectId,
      ).result as { token: string };
    const inviteA = invite(f.projectId, 'Runner A');
    const inviteB = invite(second, 'Runner B');

    // REM-02: invitations are single-use; REM-01: the token file is private and TLS is required remotely.
    const dirA = join(directory, 'a');
    const dirB = join(directory, 'b');
    const a = await enrollRunner({ url: URL_BASE, invitation: inviteA.token, directory: dirA });
    const b = await enrollRunner({ url: URL_BASE, invitation: inviteB.token, directory: dirB });
    expect(statSync(join(dirA, 'runner-token')).mode & 0o777).toBe(0o600);
    await expect(
      enrollRunner({
        url: URL_BASE,
        invitation: inviteA.token,
        directory: join(directory, 'again'),
      }),
    ).rejects.toThrow('INVITATION_INVALID');
    await expect(
      enrollRunner({
        url: URL_BASE,
        invitation: 'inv_not_a_real_token_value',
        directory: join(directory, 'bad'),
      }),
    ).rejects.toThrow('INVITATION_INVALID');
    expect(() => assertSecureControlUrl('http://control.example.com')).toThrow('TLS_REQUIRED');
    expect(assertSecureControlUrl('https://control.example.com').protocol).toBe('https:');
    const stored = JSON.stringify(
      f.control.ctx.sqlite.prepare('SELECT tokenHash FROM machine_invitations').all(),
    );
    expect(stored).not.toContain(inviteA.token); // only a hash is kept

    const processA = launch(dirA);
    const processB = launch(dirB);

    // REM-03 / project scope: each runner only ever receives work from its own project.
    const workOne = String(
      owner(
        'work.create',
        { title: 'Project one work', description: '', acceptance: 'x' },
        f.projectId,
      ).result['id'],
    );
    owner('work.assign', { workId: workOne, agentId: f.senderId }, f.projectId, 1);
    const workTwo = String(
      owner('work.create', { title: 'Project two work', description: '', acceptance: 'x' }, second)
        .result['id'],
    );
    owner('work.assign', { workId: workTwo, agentId: agentTwo }, second, 1);
    const machineOf = (workId: string) =>
      (
        f.control.ctx.sqlite.prepare('SELECT machineId FROM runs WHERE workId=?').get(workId) as
          { machineId: string | null } | undefined
      )?.machineId ?? undefined;
    expect(await until(() => machineOf(workOne))).toBe(a.machineId);
    expect(await until(() => machineOf(workTwo))).toBe(b.machineId);
    await until(
      () =>
        (
          f.control.ctx.sqlite.prepare('SELECT state FROM work_items WHERE id=?').get(workOne) as {
            state: string;
          }
        ).state === 'reviewing',
    );

    // Revocation: B's identity is revoked, so its next call fails and it never claims again.
    const identityB = (
      f.control.ctx.sqlite
        .prepare('SELECT id FROM identities WHERE machineId=?')
        .get(b.machineId) as { id: string }
    ).id;
    revoke(f.control.ctx, f.owner.actor, identityB);
    await until(() => processB.exitCode !== null || processB.signalCode !== null, 30000); // halts on 401
    const lateTwo = String(
      owner('work.create', { title: 'After revoke', description: '', acceptance: 'x' }, second)
        .result['id'],
    );
    owner('work.assign', { workId: lateTwo, agentId: agentTwo }, second, 1);
    await delay(3000); // a negative wait: a revoked runner must never take the work, so there is nothing to wait for
    expect(machineOf(lateTwo)).toBeUndefined();

    // Reconnect: control goes away and comes back on the same database; runner A keeps working.
    await app.close();
    const afterOutage = String(
      owner(
        'work.create',
        { title: 'During outage', description: '', acceptance: 'x' },
        f.projectId,
      ).result['id'],
    );
    owner('work.assign', { workId: afterOutage, agentId: f.recipientId }, f.projectId, 1);
    app = createServer(f.control, { origin: URL_BASE });
    await app.listen({ host: '127.0.0.1', port: PORT });
    expect(await until(() => machineOf(afterOutage), 30000)).toBe(a.machineId);
    expect(processA.exitCode).toBeNull(); // never died during the outage
    expect(readFileSync(join(dirA, 'runner-token'), 'utf8').trim().length).toBeGreaterThan(20);
  } finally {
    await app.close();
    f.control.close();
  }
}, 120000);
