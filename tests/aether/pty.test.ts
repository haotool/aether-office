import { it, expect, vi } from 'vitest';
import { mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { setTimeout as delay } from 'node:timers/promises';
import { PtySession } from '../../apps/runner/src/pty.js';
const owner = { id: 'owner', role: 'owner' as const },
  other = { id: 'other', role: 'operator' as const };
async function until(predicate: () => boolean) {
  for (let i = 0; i < 200; i++) {
    if (predicate()) return;
    await delay(10);
  }
  throw new Error('PTY_FIXTURE_TIMEOUT');
}
it.skipIf(process.platform === 'win32')(
  'uses a real PTY for UTF-8, ANSI, resize, reconnect cursors and exclusive expiring control',
  async () => {
    const dir = mkdtempSync(join(tmpdir(), 'aether-pty-'));
    let terminal: PtySession | undefined;
    let now = 1000;
    try {
      vi.stubEnv('AETHER_RUNNER_TOKEN', 'synthetic-should-not-leak');
      const script = join(dir, 'fixture.mjs');
      writeFileSync(
        script,
        "if(!process.stdin.isTTY||!process.stdout.isTTY||process.env.AETHER_RUNNER_TOKEN)process.exit(98);process.stdin.setRawMode(true);process.stdin.setEncoding('utf8');process.stdout.write('\\x1b[32mREADY 狐狸🦊\\x1b[0m');process.stdin.on('data',s=>{if(s==='S')process.stdout.write('SIZE:'+process.stdout.columns+'x'+process.stdout.rows);else if(s==='F')process.stdout.write('x'.repeat(8192)+'狐狸🦊');else if(s==='E')process.exit(7);else process.stdout.write('ECHO:'+s);});",
      );
      terminal = new PtySession(
        { binary: process.execPath, args: [script], cwd: dir, timeoutMs: 10000 },
        { cols: 80, rows: 24 },
        4096,
        () => now,
      );
      const text = () =>
        terminal!
          .read()
          .chunks.map((c) => c.data)
          .join('');
      await until(() => text().includes('READY 狐狸🦊'));
      expect(text()).toContain('\x1b[32m');
      expect(() => terminal!.acquire({ id: 'viewer', role: 'viewer' })).toThrow(
        'PTY_WRITE_FORBIDDEN',
      );
      const lease = terminal.acquire(owner);
      expect(() => terminal!.acquire(other)).toThrow('PTY_ALREADY_CONTROLLED');
      expect(() => terminal!.write(other, lease.token, 'E')).toThrow('PTY_CONTROL_LEASE_REQUIRED');
      const cursor = terminal.read().cursor;
      terminal.resize(owner, lease.token, { cols: 101, rows: 37 });
      terminal.write(owner, lease.token, 'S');
      await until(() => text().includes('SIZE:101x37'));
      expect(
        terminal
          .read(cursor)
          .chunks.map((c) => c.data)
          .join(''),
      ).not.toContain('READY');
      terminal.write(owner, lease.token, '繁體中文');
      await until(() => text().includes('ECHO:繁體中文'));
      now += 30001;
      expect(() => terminal!.write(owner, lease.token, 'E')).toThrow('PTY_CONTROL_LEASE_REQUIRED');
      const next = terminal.acquire(other);
      terminal.write(other, next.token, 'F');
      await until(() => terminal!.read().gap);
      expect(terminal.read().bytes).toBeLessThanOrEqual(4096);
      expect(text()).not.toContain('\ufffd');
      terminal.write(other, next.token, 'E');
      expect(await terminal.exited).toMatchObject({ exitCode: 7 });
      expect(terminal.read().state).toBe('exited');
      expect(() => terminal!.acquire(owner)).toThrow('PTY_EXITED');
    } finally {
      terminal?.stop();
      if (terminal) await terminal.exited;
      vi.unstubAllEnvs();
      rmSync(dir, { recursive: true, force: true });
    }
  },
);
it.skipIf(process.platform === 'win32')('bounds a PTY process which ignores TERM', async () => {
  const dir = mkdtempSync(join(tmpdir(), 'aether-pty-timeout-'));
  let terminal: PtySession | undefined;
  try {
    const started = Date.now();
    terminal = new PtySession(
      {
        binary: process.execPath,
        args: ['-e', "process.on('SIGTERM',()=>{});console.log('READY');setInterval(()=>{},100);"],
        cwd: dir,
        timeoutMs: 300,
      },
      { cols: 80, rows: 24 },
    );
    await until(() => terminal!.read().chunks.some((c) => c.data.includes('READY')));
    await terminal.exited;
    expect(Date.now() - started).toBeLessThan(2500);
  } finally {
    terminal?.stop();
    if (terminal) await terminal.exited;
    rmSync(dir, { recursive: true, force: true });
  }
});

it.skipIf(process.platform === 'win32')(
  'terminates the owned PTY process group after its leader exits',
  async () => {
    const dir = mkdtempSync(join(tmpdir(), 'aether-pty-descendant-'));
    let terminal: PtySession | undefined;
    let descendant: number | undefined;
    try {
      const script = join(dir, 'parent.mjs');
      writeFileSync(
        script,
        `import {spawn} from 'node:child_process';const child=spawn(process.execPath,['-e',"process.on('SIGTERM',()=>{});console.log('child-ready');setInterval(()=>{},100);"],{stdio:['ignore','pipe','ignore']});child.stdout.once('data',()=>console.log('DESCENDANT:'+child.pid));setInterval(()=>{},100);`,
      );
      terminal = new PtySession(
        { binary: process.execPath, args: [script], cwd: dir, timeoutMs: 10000 },
        { cols: 80, rows: 24 },
      );
      await until(() => terminal!.read().chunks.some((c) => c.data.includes('DESCENDANT:')));
      descendant = Number(
        terminal
          .read()
          .chunks.map((c) => c.data)
          .join('')
          .match(/DESCENDANT:(\d+)/)![1],
      );
      terminal.stop();
      await terminal.exited;
      await until(() => {
        try {
          process.kill(descendant!, 0);
          return false;
        } catch (error) {
          if ((error as NodeJS.ErrnoException).code === 'ESRCH') return true;
          throw error;
        }
      });
    } finally {
      terminal?.stop();
      if (terminal) await terminal.exited;
      if (descendant)
        try {
          process.kill(descendant, 'SIGKILL');
        } catch (error) {
          if ((error as NodeJS.ErrnoException).code !== 'ESRCH') throw error;
        }
      rmSync(dir, { recursive: true, force: true });
    }
  },
);
