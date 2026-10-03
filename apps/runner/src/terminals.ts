import { z } from 'zod';
import {
  terminalDispatchSchema,
  terminalDimensions,
  type TerminalDispatch,
  type TerminalSnapshot,
} from '@aether/contracts';
import { PtySession, type TerminalUser } from './pty.js';
import type { Journal } from './journal.js';
import type { NativeExecutor } from './native.js';
type Api = (path: string, body: unknown) => Promise<unknown>;
export class TerminalRunner {
  private sessions = new Map<string, PtySession>();
  private leases = new Map<string, { epoch: number; user: TerminalUser; token: string }>();
  constructor(
    private journal: Journal,
    private native: NativeExecutor,
    private api: Api,
  ) {}
  get active() {
    return this.sessions.size > 0;
  }
  recover() {
    for (const entry of Object.values(this.journal.state.terminalCommands)) {
      entry.result ??= {
        commandId: entry.command.id,
        status: 'indeterminate',
        error: 'RUNNER_RESTARTED_RESULT_UNKNOWN',
      };
      entry.command.payload = {};
    }
    for (const entry of Object.values(this.journal.state.terminals))
      if (entry.snapshot.state !== 'exited') {
        entry.snapshot.state = 'indeterminate';
        entry.snapshot.gap = true;
        entry.pending = true;
      }
    this.journal.save();
  }
  private execute(c: TerminalDispatch) {
    const entry = this.journal.state.terminalCommands[c.id]!;
    try {
      if (c.kind === 'start') {
        if (this.sessions.has(c.terminalId) || this.journal.state.terminals[c.terminalId])
          throw new Error('TERMINAL_ALREADY_STARTED');
        const profile = this.native.terminalProfiles.get(c.profile);
        if (!profile || profile.hash !== c.profileHash || profile.root !== c.root)
          throw new Error('TERMINAL_PROFILE_CHANGED');
        const dimensions = z.object(terminalDimensions).parse(c.payload);
        // ponytail: 8 KiB snapshot fits the bounded HTTP envelope even with ANSI escaping; chunked transport if larger scrollback is needed.
        this.sessions.set(c.terminalId, new PtySession(profile.profile, dimensions, 8192));
      } else {
        const pty = this.sessions.get(c.terminalId);
        if (!pty) {
          if (
            c.kind === 'stop' &&
            this.journal.state.terminals[c.terminalId]?.snapshot.state === 'exited'
          ) {
            entry.result = { commandId: c.id, status: 'applied' };
            entry.command.payload = {};
            this.journal.save();
            return;
          }
          throw new Error('TERMINAL_PROCESS_NOT_OWNED');
        }
        if (c.kind === 'stop') pty.stop();
        else {
          let lease = this.leases.get(c.terminalId);
          if (lease && (lease.epoch !== c.controlEpoch || lease.user.id !== c.identityId)) {
            try {
              pty.release(lease.user, lease.token);
            } catch (error) {
              if (!(error instanceof Error) || error.message !== 'PTY_CONTROL_LEASE_REQUIRED')
                throw error;
            }
            lease = undefined;
          }
          const user: TerminalUser = { id: c.identityId, role: 'operator' };
          // Canonical authorization was checked at dispatch; local lease cannot grant project access.
          const acquired = pty.acquire(user);
          lease = { epoch: c.controlEpoch, user, token: acquired.token };
          this.leases.set(c.terminalId, lease);
          if (c.kind === 'input')
            pty.write(user, lease.token, z.string().min(1).max(8192).parse(c.payload['text']));
          else pty.resize(user, lease.token, z.object(terminalDimensions).parse(c.payload));
        }
      }
      entry.result = { commandId: c.id, status: 'applied' };
    } catch (error) {
      entry.result = {
        commandId: c.id,
        status: 'failed',
        error:
          error instanceof Error && /^[A-Z_]+$/.test(error.message)
            ? error.message
            : 'TERMINAL_EXECUTION_FAILED',
      };
    }
    // Save before acknowledging; accepted but unfinished records are never replayed after restart.
    entry.command.payload = {};
    this.journal.save();
    this.capture();
  }
  private capture() {
    for (const [id, pty] of this.sessions) {
      const value = pty.read();
      const snapshot: TerminalSnapshot = {
        terminalId: id,
        state: value.state as 'running' | 'exited',
        processIdentity: value.processIdentity,
        cursor: value.cursor,
        gap: value.gap,
        chunks: value.chunks,
        exit: value.exit,
        dimensions: value.dimensions,
      };
      if (JSON.stringify(this.journal.state.terminals[id]?.snapshot) !== JSON.stringify(snapshot)) {
        this.journal.state.terminals[id] = { snapshot, pending: true };
        this.journal.save();
      }
    }
  }
  async flush() {
    this.capture();
    for (const [id, entry] of Object.entries(this.journal.state.terminalCommands))
      if (entry.result) {
        await this.api('/api/runner/terminals/result', entry.result);
        delete this.journal.state.terminalCommands[id];
        this.journal.save();
      }
    for (const entry of Object.values(this.journal.state.terminals))
      if (entry.pending) {
        await this.api('/api/runner/terminals/snapshot', entry.snapshot);
        entry.pending = false;
        this.journal.save();
      }
    for (const [id, pty] of this.sessions)
      if (
        this.journal.state.terminals[id]?.snapshot.state === 'exited' &&
        !this.journal.state.terminals[id]?.pending
      ) {
        this.sessions.delete(id);
        this.leases.delete(id);
      }
  }
  async tick() {
    await this.flush();
    const response = (await this.api('/api/runner/terminals/claim', {})) as { command: unknown };
    if (response.command) {
      const c = terminalDispatchSchema.parse(response.command);
      if (!this.journal.state.terminalCommands[c.id]) {
        this.journal.state.terminalCommands[c.id] = { command: c };
        this.journal.save();
        this.execute(c);
      }
      await this.flush();
    }
  }
  stop(ids?: string[]) {
    for (const [id, pty] of this.sessions) if (!ids || ids.includes(id)) pty.stop();
  }
  async drain() {
    await Promise.all([...this.sessions.values()].map((p) => p.exited));
    await this.flush();
  }
}
