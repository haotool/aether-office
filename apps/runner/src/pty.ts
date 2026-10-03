import { spawn, type IPty } from 'node-pty';
import { randomUUID } from 'node:crypto';
import { realpathSync } from 'node:fs';
import { isAbsolute } from 'node:path';
import { processIdentity } from '@aether/providers';
import { z } from 'zod';
const size = z
  .object({ cols: z.number().int().min(10).max(400), rows: z.number().int().min(2).max(200) })
  .strict();
const profileSchema = z
  .object({
    binary: z.string().refine(isAbsolute),
    args: z.array(z.string().max(4096)).max(64),
    cwd: z.string().refine(isAbsolute),
    timeoutMs: z.number().int().min(100).max(3600000).default(600000),
  })
  .strict();
export type PtyProfile = z.input<typeof profileSchema>;
export type TerminalUser = {
  id: string;
  role: 'owner' | 'operator' | 'reviewer' | 'viewer' | 'agent' | 'runner';
};
export type TerminalChunk = { seq: number; data: string };
/** Runner-local primitive. Callers must enforce project scope before giving access to a session. */
export class PtySession {
  readonly id = randomUUID();
  readonly processIdentity: string;
  readonly exited: Promise<{ exitCode: number; signal: number | null }>;
  private child: IPty;
  private chunks: TerminalChunk[] = [];
  private bytes = 0;
  private seq = 0;
  private droppedThrough = 0;
  private lease: { owner: string; token: string; expiresAt: number } | null = null;
  private exit: { exitCode: number; signal: number | null } | null = null;
  private deadline: ReturnType<typeof setTimeout>;
  private killTimer: ReturnType<typeof setTimeout> | undefined;
  private dimensions: { cols: number; rows: number };
  constructor(
    profile: PtyProfile,
    dimensions: { cols: number; rows: number },
    private readonly byteLimit = 1024 * 1024,
    private readonly now: () => number = Date.now,
  ) {
    if (process.platform === 'win32') throw new Error('PTY_NATIVE_WINDOWS_UNVERIFIED');
    if (!Number.isInteger(byteLimit) || byteLimit < 1024 || byteLimit > 4 * 1024 * 1024)
      throw new Error('PTY_INVALID_BUFFER_LIMIT');
    const p = profileSchema.parse(profile);
    this.dimensions = size.parse(dimensions);
    const env = Object.fromEntries(
      ['PATH', 'HOME', 'USER', 'TMPDIR', 'LANG', 'LC_ALL', 'SHELL'].flatMap((key) =>
        process.env[key] === undefined ? [] : [[key, process.env[key]]],
      ),
    );
    this.child = spawn(realpathSync(p.binary), p.args, {
      cwd: realpathSync(p.cwd),
      ...this.dimensions,
      name: 'xterm-256color',
      encoding: 'utf8',
      env,
    });
    try {
      this.processIdentity = processIdentity(this.child);
    } catch (error) {
      this.child.kill('SIGKILL');
      throw error;
    }
    this.child.onData((data) => {
      const seq = ++this.seq;
      let chunk = Buffer.from(data);
      if (chunk.length > this.byteLimit) {
        let start = chunk.length - this.byteLimit;
        while (start < chunk.length && (chunk[start]! & 0xc0) === 0x80) start++;
        chunk = chunk.subarray(start);
        this.droppedThrough = seq;
      }
      this.chunks.push({ seq, data: chunk.toString('utf8') });
      this.bytes += chunk.length;
      while (this.bytes > this.byteLimit || this.chunks.length > 256) {
        const dropped = this.chunks.shift()!;
        this.bytes -= Buffer.byteLength(dropped.data);
        this.droppedThrough = Math.max(this.droppedThrough, dropped.seq);
      }
    });
    this.exited = new Promise((resolve) =>
      this.child.onExit((event) => {
        this.exit = { exitCode: event.exitCode, signal: event.signal ?? null };
        this.lease = null;
        clearTimeout(this.deadline);
        resolve(this.exit);
      }),
    );
    this.deadline = setTimeout(() => this.stop(), p.timeoutMs);
    this.deadline.unref();
  }
  read(after = 0) {
    if (!Number.isSafeInteger(after) || after < 0 || after > this.seq)
      throw new Error('PTY_INVALID_CURSOR');
    return {
      id: this.id,
      processIdentity: this.processIdentity,
      state: this.exit ? 'exited' : 'running',
      exit: this.exit,
      dimensions: this.dimensions,
      cursor: this.seq,
      gap: after < this.droppedThrough,
      chunks: this.chunks.filter((c) => c.seq > after),
      bytes: this.bytes,
      controller: this.lease && this.lease.expiresAt > this.now() ? this.lease.owner : null,
    };
  }
  acquire(user: TerminalUser) {
    if (!['owner', 'operator'].includes(user.role)) throw new Error('PTY_WRITE_FORBIDDEN');
    if (this.exit) throw new Error('PTY_EXITED');
    if (this.lease && this.lease.expiresAt > this.now() && this.lease.owner !== user.id)
      throw new Error('PTY_ALREADY_CONTROLLED');
    this.lease = { owner: user.id, token: randomUUID(), expiresAt: this.now() + 30000 };
    return { ...this.lease };
  }
  private controller(user: TerminalUser, token: string) {
    if (
      !['owner', 'operator'].includes(user.role) ||
      !this.lease ||
      this.lease.owner !== user.id ||
      this.lease.token !== token ||
      this.lease.expiresAt <= this.now()
    )
      throw new Error('PTY_CONTROL_LEASE_REQUIRED');
    if (this.exit) throw new Error('PTY_EXITED');
    this.lease.expiresAt = this.now() + 30000;
  }
  write(user: TerminalUser, token: string, data: string) {
    this.controller(user, token);
    if (typeof data !== 'string' || Buffer.byteLength(data) > 16384)
      throw new Error('PTY_INPUT_LIMIT');
    this.child.write(data);
    return { state: 'written_to_pty' as const };
  }
  resize(user: TerminalUser, token: string, dimensions: { cols: number; rows: number }) {
    this.controller(user, token);
    const next = size.parse(dimensions);
    this.child.resize(next.cols, next.rows);
    this.dimensions = next;
  }
  release(user: TerminalUser, token: string) {
    this.controller(user, token);
    this.lease = null;
  }
  /** Only the in-memory owned process is signalled; persisted PIDs are never adopted. */
  private signalGroup(signal: NodeJS.Signals) {
    try {
      process.kill(-this.child.pid, signal);
    } catch (error) {
      if ((error as NodeJS.ErrnoException).code !== 'ESRCH') throw error;
    }
  }
  stop() {
    if (this.exit) return;
    this.signalGroup('SIGTERM');
    this.killTimer ??= setTimeout(() => this.signalGroup('SIGKILL'), 1000);
  }
}
