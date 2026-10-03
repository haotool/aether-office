import { createServer as createPortReservation } from 'node:net';
import { it, expect } from 'vitest';
import { mkdtempSync, writeFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { setTimeout as delay } from 'node:timers/promises';
import { Control } from '../../apps/control/src/control.js';
import { createServer } from '../../apps/control/src/server.js';
import { enroll } from '../../apps/control/src/services/runners.js';
import { claimTerminalCommand, readTerminal } from '../../apps/control/src/services/terminals.js';
import { NativeExecutor } from '../../apps/runner/src/native.js';
import { Runner } from '../../apps/runner/src/runner.js';
import { TerminalRunner } from '../../apps/runner/src/terminals.js';
import { Journal } from '../../apps/runner/src/journal.js';
import { command } from './fixture.js';
it.skipIf(process.platform === 'win32')(
  'connects canonical commands through real HTTP to a real interactive PTY',
  async () => {
    const dir = mkdtempSync(join(tmpdir(), 'aether-terminal-wire-'));
    const control = new Control(join(dir, 'control.sqlite'), { mode: 'live' });
    const reservation = createPortReservation();
    await new Promise<void>((resolve) => reservation.listen(0, '127.0.0.1', resolve));
    const port = (reservation.address() as { port: number }).port;
    await new Promise<void>((resolve, reject) =>
      reservation.close((error) => (error ? reject(error) : resolve())),
    );
    const url = `http://127.0.0.1:${port}`;
    const app = createServer(control, { origin: url });
    let runner: Runner | undefined;
    try {
      const owner = control.createIdentity(undefined, {
        name: 'Owner',
        role: 'owner',
        projectIds: ['*'],
      });
      const projectId = String(
        control.execute(
          owner.actor,
          command('project.create', { name: 'True PTY transport fixture', root: dir }),
        ).result['id'],
      );
      control.execute(
        owner.actor,
        command(
          'project.execution.configure',
          { liveEnabled: true, maxTurns: 1, timeoutMs: 10000 },
          projectId,
          0,
        ),
      );
      const machine = enroll(control.ctx, owner.actor, 'Real PTY fixture', [projectId]);
      const script = join(dir, 'terminal.mjs');
      writeFileSync(
        script,
        "if(!process.stdin.isTTY)process.exit(98);process.stdin.setRawMode(true);process.stdin.setEncoding('utf8');console.log('READY 狐狸');process.stdin.on('data',s=>{if(s==='E')process.exit(7);else console.log('ECHO:'+s+' SIZE:'+process.stdout.columns+'x'+process.stdout.rows);});",
      );
      const native = new NativeExecutor(join(dir, 'workspaces'), {
        enabled: true,
        repositories: [dir],
        binaries: {},
        terminals: {
          fixture: { binary: process.execPath, args: [script], root: dir, timeoutMs: 30000 },
        },
      });
      const journal = new Journal(join(dir, 'journal.json'));
      runner = new Runner(url, machine.token, journal, native);
      await app.listen({ host: '127.0.0.1', port });
      await runner.tick();
      const terminalId = String(
        control.execute(
          owner.actor,
          command(
            'terminal.start',
            { machineId: machine.machineId, profile: 'fixture', cols: 80, rows: 24 },
            projectId,
          ),
        ).result['id'],
      );
      const read = () =>
        readTerminal(control.ctx, owner.actor, projectId, terminalId) as {
          state: string;
          snapshot: string | null;
        };
      const output = () =>
        read().snapshot
          ? JSON.parse(read().snapshot!)
              .chunks.map((c: { data: string }) => c.data)
              .join('')
          : '';
      const until = async (predicate: () => boolean) => {
        for (let i = 0; i < 100; i++) {
          await runner!.tick();
          if (predicate()) return;
          await delay(25);
        }
        throw new Error(
          'TERMINAL_WIRE_TIMEOUT ' +
            JSON.stringify({
              terminal: read(),
              commands: control.ctx.sqlite
                .prepare('SELECT kind,state,result FROM terminal_commands')
                .all(),
            }),
        );
      };
      await until(() => output().includes('READY 狐狸'));
      expect(read().state).toBe('running');
      expect(journal.state.terminals[terminalId]?.snapshot.processIdentity).toMatch(/^\d+:/);
      control.execute(
        owner.actor,
        command('terminal.takeover', { terminalId, epoch: 0 }, projectId),
      );
      control.execute(
        owner.actor,
        command('terminal.resize', { terminalId, epoch: 1, cols: 111, rows: 31 }, projectId),
      );
      const input = command(
        'terminal.input',
        { terminalId, epoch: 1, text: '繁體中文' },
        projectId,
      );
      control.execute(owner.actor, input);
      control.execute(owner.actor, input);
      await until(() => output().includes('ECHO:繁體中文 SIZE:111x31'));
      expect(output().split('ECHO:繁體中文').length - 1).toBe(1);
      control.execute(
        owner.actor,
        command('terminal.input', { terminalId, epoch: 1, text: 'E' }, projectId),
      );
      await until(() => read().state === 'exited');
      expect(JSON.parse(read().snapshot!).exit.exitCode).toBe(7);
      expect(Object.keys(journal.state.terminalCommands)).toHaveLength(0);
      const secondId = String(
        control.execute(
          owner.actor,
          command(
            'terminal.start',
            { machineId: machine.machineId, profile: 'fixture', cols: 80, rows: 24 },
            projectId,
          ),
        ).result['id'],
      );
      await until(
        () =>
          (readTerminal(control.ctx, owner.actor, projectId, secondId) as { state: string })
            .state === 'running',
      );
      control.execute(
        owner.actor,
        command('terminal.takeover', { terminalId: secondId, epoch: 0 }, projectId),
      );
      control.execute(
        owner.actor,
        command(
          'terminal.input',
          { terminalId: secondId, epoch: 1, text: 'DO_NOT_REPLAY' },
          projectId,
        ),
      );
      const lost = claimTerminalCommand(control.ctx, machine.actor)!;
      expect(lost.kind).toBe('input');
      journal.state.terminalCommands[lost.id] = { command: lost };
      journal.save();
      const recoveredJournal = new Journal(journal.filename);
      const recovered = new TerminalRunner(recoveredJournal, native, (path, body) =>
        runner!.api(path, body),
      );
      recovered.recover();
      await recovered.flush();
      expect(
        (readTerminal(control.ctx, owner.actor, projectId, secondId) as { state: string }).state,
      ).toBe('indeterminate');
      expect(
        control.ctx.sqlite.prepare('SELECT state FROM terminal_commands WHERE id=?').get(lost.id),
      ).toEqual({ state: 'indeterminate' });
      // Retain the original in-memory owner solely for cleanup of this crash simulation.
      delete journal.state.terminalCommands[lost.id];
      await runner.terminals!.flush();
      expect(JSON.stringify(journal.state.terminals[secondId]?.snapshot)).not.toContain(
        'DO_NOT_REPLAY',
      );
    } finally {
      if (runner) await runner.shutdown();
      await app.close();
      control.close();
      rmSync(dir, { recursive: true, force: true });
    }
  },
  15000,
);
