import {
  openSync,
  closeSync,
  fsyncSync,
  writeFileSync,
  renameSync,
  readFileSync,
  existsSync,
  mkdirSync,
} from 'node:fs';
import { dirname } from 'node:path';
import type {
  RunCommand,
  RunnerEvent,
  RunnerJob,
  TerminalDispatch,
  TerminalSnapshot,
  ObservationReport,
} from '@aether/contracts';
import type { ObserverCheckpoint } from './observer.js';
export type ObserverJournal = {
  scope: string;
  file: string;
  checkpoint: ObserverCheckpoint | null;
  fingerprint: string | null;
  revision: number;
  lastReportedAt: number;
  status: string;
  seen: string[];
  pending: ObservationReport[];
};
export type JournalState = {
  schemaVersion: 1;
  observers: Record<string, ObserverJournal>;
  terminalCommands: Record<
    string,
    {
      command: TerminalDispatch;
      result?: {
        commandId: string;
        status: 'applied' | 'failed' | 'indeterminate';
        error?: string;
      };
    }
  >;
  terminals: Record<string, { snapshot: TerminalSnapshot; pending: boolean }>;
  runs: Record<
    string,
    { command: RunCommand; state: 'accepted' | 'running' | 'finished'; processIdentity?: string }
  >;
  pending: RunnerEvent[];
  jobs: Record<string, { job: RunnerJob; state: 'running' | 'finished'; result?: unknown }>;
};
/** Runner-only execution journal; never opens the control database. */
export class Journal {
  state: JournalState;
  constructor(readonly filename: string) {
    mkdirSync(dirname(filename), { recursive: true, mode: 0o700 });
    this.state = existsSync(filename)
      ? (JSON.parse(readFileSync(filename, 'utf8')) as JournalState)
      : {
          schemaVersion: 1,
          runs: {},
          pending: [],
          jobs: {},
          terminalCommands: {},
          terminals: {},
          observers: {},
        };
    this.state.observers ??= {};
    this.state.jobs ??= {};
    this.state.terminalCommands ??= {};
    this.state.terminals ??= {};
    if (this.state.schemaVersion !== 1 || !this.state.runs || !Array.isArray(this.state.pending))
      throw new Error('JOURNAL_SCHEMA_UNSUPPORTED');
  }
  save(): void {
    const body = JSON.stringify(this.state);
    if (Buffer.byteLength(body) > 8 * 1024 * 1024) throw new Error('RUNNER_SPOOL_FULL');
    const file = this.filename + '.tmp';
    const fd = openSync(file, 'w', 0o600);
    try {
      writeFileSync(fd, body);
      fsyncSync(fd);
    } finally {
      closeSync(fd);
    }
    renameSync(file, this.filename);
    const directory = openSync(dirname(file), 'r');
    try {
      fsyncSync(directory);
    } finally {
      closeSync(directory);
    }
  }
  accept(command: RunCommand): boolean {
    if (this.state.runs[command.runId]) return false;
    if (this.state.pending.length >= 500) throw new Error('RUNNER_BACKPRESSURE');
    this.state.runs[command.runId] = { command, state: 'accepted' };
    this.save();
    return true;
  }
  enqueue(event: RunnerEvent): void {
    this.state.pending.push(event);
    this.save();
  }
  acknowledge(sourceEventId: string): void {
    this.state.pending = this.state.pending.filter((e) => e.sourceEventId !== sourceEventId);
    this.save();
  }
}
