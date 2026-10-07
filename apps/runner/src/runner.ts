import { randomUUID } from 'node:crypto';
import {
  runnerJobSchema,
  type RunCommand,
  type RunnerEvent,
  type RunnerJob,
} from '@aether/contracts';
import { reapSurvivor, runFixture, type ProviderResult, type Reaped } from '@aether/providers';
import { ObserverRunner } from './observers.js';
import { settleInterruptedWork } from './runner-recovery.js';
import { warn } from './stdio.js';
import { runWorkspaceJob } from './workspace-jobs.js';
import { assertSecureControlUrl } from './transport.js';
import { TerminalRunner } from './terminals.js';
import { Journal } from './journal.js';
import { setTimeout as delay } from 'node:timers/promises';
import type { NativeSink } from '@aether/providers';
import type { NativeExecutor } from './native.js';
export class Runner {
  private readonly survivors = new Map<string, Reaped>();
  readonly terminals: TerminalRunner | undefined;
  readonly observers: ObserverRunner | undefined;
  private observerError: string | null = null;
  private observing: Promise<void> | undefined;
  readonly active = new Map<string, AbortController>();
  private timer: ReturnType<typeof setTimeout> | undefined;
  private stopped = false;
  private ticking = false;
  private flushing: Promise<void> | undefined;
  private activeJob: AbortController | undefined;
  private activeJobId: string | undefined;
  constructor(
    readonly url: string,
    private readonly token: string,
    readonly journal: Journal,
    private readonly native?: NativeExecutor,
  ) {
    this.observers = native
      ? new ObserverRunner(journal, native, (path, body) => this.api(path, body, false))
      : undefined;
    this.terminals = native
      ? new TerminalRunner(journal, native, (path, body) => this.api(path, body))
      : undefined;
    assertSecureControlUrl(url);
  }
  async api<T>(path: string, body: unknown, haltOnForbidden = true): Promise<T> {
    const response = await fetch(new URL(path, this.url), {
      method: 'POST',
      headers: { authorization: `Bearer ${this.token}`, 'content-type': 'application/json' },
      body: JSON.stringify(body),
      signal: AbortSignal.timeout(5000),
      redirect: 'error',
    });
    if (!response.ok) {
      if (response.status === 401 || (response.status === 403 && haltOnForbidden)) this.stop();
      throw new Error(`CONTROL_HTTP_${response.status}`);
    }
    return (await response.json()) as T;
  }
  async flush(): Promise<void> {
    if (this.flushing) return this.flushing;
    this.flushing = (async () => {
      for (
        let event = this.journal.state.pending[0];
        event;
        event = this.journal.state.pending[0]
      ) {
        await this.api('/api/runner/report', event);
        this.journal.acknowledge(event.sourceEventId);
      }
    })();
    try {
      await this.flushing;
    } finally {
      this.flushing = undefined;
    }
  }
  private enqueue(event: RunnerEvent): void {
    this.journal.enqueue(event);
  }
  private async executeJob(job: RunnerJob, abort: AbortController): Promise<void> {
    const result = await runWorkspaceJob(this.native, job, abort.signal);
    this.journal.state.jobs[job.id] = { job, state: 'finished', result };
    this.journal.save();
    this.activeJob = undefined;
    this.activeJobId = undefined;
  }
  private async flushJobs(): Promise<void> {
    for (const [id, entry] of Object.entries(this.journal.state.jobs))
      if (entry.result) {
        await this.api('/api/runner/jobs/report', entry.result);
        delete this.journal.state.jobs[id];
        this.journal.save();
      }
  }
  /** The journal entry `journal.accept` made for this run before it was started. */
  private acceptedRun(runId: string) {
    const run = this.journal.state.runs[runId];
    if (!run) throw new Error('RUN_NOT_JOURNALED');
    return run;
  }
  private markStarted(command: RunCommand, providerSessionId: string, processIdentity: string) {
    this.journal.state.runs[command.runId] = { command, state: 'running', processIdentity };
    this.enqueue({
      runId: command.runId,
      epoch: command.epoch,
      type: 'started',
      sourceEventId: randomUUID(),
      providerSessionId,
      processIdentity,
    });
  }
  /** What a native provider reports while it runs: its process, its events and the permission prompts for a person. */
  private nativeSink(command: RunCommand, abort: AbortController): NativeSink {
    const base = { runId: command.runId, epoch: command.epoch };
    let processIdentity: string | undefined;
    return {
      processStarted: async (identity) => {
        processIdentity = identity;
        this.acceptedRun(command.runId).processIdentity = identity;
        this.journal.save();
      },
      event: async (event) => {
        if (event.kind !== 'session.started')
          return this.enqueue({ ...base, type: 'provider', sourceEventId: randomUUID(), event });
        if (!processIdentity) throw new Error('PROCESS_OWNERSHIP_REQUIRED');
        this.markStarted(command, event.providerSessionId, processIdentity);
      },
      permission: async (permission) => {
        await this.flush();
        const request = await this.api<{ id: string; expiresAt: number }>(
          '/api/runner/approvals/request',
          { ...base, ...permission },
        );
        while (!abort.signal.aborted && Date.now() < request.expiresAt) {
          const answer = await this.api<{ decision: 'approve' | 'deny' | null }>(
            '/api/runner/approvals/poll',
            { runId: command.runId, approvalId: request.id },
          );
          if (answer.decision) return answer.decision;
          await delay(500, undefined, { signal: abort.signal });
        }
        return 'deny';
      },
      permissionSent: async (requestId) => {
        await this.api('/api/runner/approvals/sent', { runId: command.runId, requestId });
      },
    };
  }
  /** Runs the demo fixture or, with a native executor, the real provider; returns what to report. */
  private async runProvider(command: RunCommand, abort: AbortController): Promise<ProviderResult> {
    const base = { runId: command.runId, epoch: command.epoch };
    if (command.provider === 'demo')
      return runFixture(
        command,
        {
          started: async (providerSessionId, processIdentity) =>
            this.markStarted(command, providerSessionId, processIdentity),
          activity: async (activity, summary) => {
            this.enqueue({
              ...base,
              type: 'activity',
              sourceEventId: randomUUID(),
              activity,
              summary,
            });
          },
        },
        abort.signal,
      );
    if (!this.native) throw new Error('NATIVE_EXECUTION_NOT_GRANTED');
    const credential = await this.api<{ token: string }>('/api/runner/session-credential', base);
    return this.native.run(
      command,
      this.nativeSink(command, abort),
      async (workspace) => {
        this.enqueue({ ...base, type: 'workspace', sourceEventId: randomUUID(), workspace });
        await this.flush();
      },
      abort.signal,
      {
        url: this.url,
        token: credential.token,
        projectId: command.projectId,
        agentId: command.agentId,
        workId: command.workId,
        runId: command.runId,
      },
    );
  }
  private async execute(command: RunCommand, abort: AbortController): Promise<void> {
    const base = { runId: command.runId, epoch: command.epoch };
    try {
      const result = await this.runProvider(command, abort);
      this.enqueue({ ...base, type: 'result', sourceEventId: randomUUID(), ...result });
    } catch (error) {
      this.enqueue({
        ...base,
        type: 'result',
        sourceEventId: randomUUID(),
        outcome: 'indeterminate',
        summary: error instanceof Error ? error.message : 'PROVIDER_ERROR',
      });
    } finally {
      this.acceptedRun(command.runId).state = 'finished';
      this.journal.save();
      this.active.delete(command.runId);
    }
  }
  /** Tells control what this runner can do and learns what it must stop. */
  private async heartbeat() {
    const heartbeat = await this.api<{
      cancelRunIds: string[];
      cancelJobIds: string[];
      cancelTerminalIds: string[];
    }>('/api/runner/heartbeat', {
      terminalProfiles: [...(this.native?.terminalProfiles ?? [])].map(([name, p]) => ({
        name,
        hash: p.hash,
        root: p.root,
      })),
      verifiers: [...(this.native?.verifiers ?? [])].map(([name, harness]) => ({
        name,
        sourceHash: harness.sourceHash,
      })),
    });
    this.terminals?.stop(heartbeat.cancelTerminalIds ?? []);
    if (this.activeJobId && heartbeat.cancelJobIds.includes(this.activeJobId))
      this.activeJob?.abort();
    for (const id of heartbeat.cancelRunIds) this.active.get(id)?.abort();
  }
  /** Looks at the observed transcripts in the background; a failure is reported once per code, never stops the tick. */
  private startObserving() {
    if (!this.observers || this.observing) return;
    this.observing = this.observers
      .tick()
      .then(() => {
        this.observerError = null;
      })
      .catch((error) => {
        const code =
          error instanceof Error && /^[A-Z_0-9]+$/.test(error.message)
            ? error.message
            : 'OBSERVATION_UNAVAILABLE';
        if (code !== this.observerError) warn(code);
        this.observerError = code;
      })
      .finally(() => {
        this.observing = undefined;
      });
  }
  private async claimJob() {
    const response = await this.api<{ job: RunnerJob | null }>('/api/runner/jobs/claim', {});
    if (!response.job) return;
    const job = runnerJobSchema.parse(response.job);
    this.journal.state.jobs[job.id] = { job, state: 'running' };
    this.journal.save();
    this.activeJob = new AbortController();
    this.activeJobId = job.id;
    void this.executeJob(job, this.activeJob).catch(() => {
      this.stop();
      warn('WORKSPACE_JOB_JOURNAL_FAILURE');
    });
  }
  private async claimRun() {
    const { command } = await this.api<{ command: RunCommand | null }>('/api/runner/claim', {
      providers: ['demo', ...(this.native?.providers ?? [])],
    });
    if (!command || !this.journal.accept(command)) return;
    const abort = new AbortController();
    this.active.set(command.runId, abort);
    void this.execute(command, abort).catch(() => {
      this.stopped = true;
      warn('RUNNER_JOURNAL_FAILURE: dispatch stopped to preserve evidence');
    });
  }
  async tick(): Promise<void> {
    if (this.stopped || this.ticking) return;
    this.ticking = true;
    try {
      await this.heartbeat();
      await this.flush();
      await this.flushJobs();
      await this.terminals?.tick();
      this.startObserving();
      if (this.native && !this.activeJob) await this.claimJob();
      if (this.active.size < 2) await this.claimRun();
    } finally {
      this.ticking = false;
    }
  }
  /**
   * Before anything starts: stops what a runner that died left running. The journal holds each run's and terminal's
   * `pid:start`; a process is stopped only if it is still that process and its owner is gone (see reapSurvivor), so a
   * crash no longer leaves an agent burning quota with nobody to report to.
   */
  async reapSurvivors(): Promise<Reaped[]> {
    const targets = [
      ...Object.values(this.journal.state.runs).flatMap((run) =>
        run.state !== 'finished' && run.processIdentity
          ? [{ key: run.command.runId, identity: run.processIdentity }]
          : [],
      ),
      ...Object.values(this.journal.state.terminals)
        .filter((t) => t.snapshot.state !== 'exited' && t.snapshot.processIdentity)
        .map((t) => ({ key: t.snapshot.terminalId, identity: t.snapshot.processIdentity })),
    ];
    return Promise.all(
      targets.map(async ({ key, identity }) => {
        const reaped = await reapSurvivor(identity);
        this.survivors.set(key, reaped);
        if (reaped.action !== 'none')
          warn(
            `Left running by the previous runner: ${identity} was ${reaped.verdict}; ${reaped.action}.`,
          );
        return reaped;
      }),
    );
  }
  start(): void {
    this.terminals?.recover();
    settleInterruptedWork(this.journal, this.survivors);
    const loop = async () => {
      try {
        await this.tick();
      } catch (error) {
        warn(error instanceof Error ? error.message : 'RUNNER_OFFLINE');
      }
      if (!this.stopped)
        this.timer = setTimeout(() => void loop(), this.terminals?.active ? 100 : 1000);
    };
    void loop();
  }
  stop(): void {
    this.stopped = true;
    if (this.timer) clearTimeout(this.timer);
    for (const abort of this.active.values()) abort.abort();
    this.activeJob?.abort();
    this.terminals?.stop();
    this.observers?.stop();
  }
  async shutdown(): Promise<void> {
    this.stop();
    const deadline = Date.now() + 15000;
    while (this.ticking || this.active.size || this.activeJob || this.observing) {
      if (Date.now() > deadline) throw new Error('RUNNER_SHUTDOWN_INCOMPLETE');
      await delay(20);
    }
    await this.flush();
    await this.flushJobs();
    await this.terminals?.drain();
  }
}
