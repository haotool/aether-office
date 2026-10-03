import { randomUUID } from 'node:crypto';
import {
  runnerJobSchema,
  type RunCommand,
  type RunnerEvent,
  type RunnerJob,
} from '@aether/contracts';
import { runFixture } from '@aether/providers';
import { ObserverRunner } from './observers.js';
import { integrate } from './merge.js';
import { TerminalRunner } from './terminals.js';
import { Journal } from './journal.js';
import { setTimeout as delay } from 'node:timers/promises';
import type { NativeSink } from '@aether/providers';
import type { NativeExecutor } from './native.js';
export class Runner {
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
    const parsed = new URL(url);
    if (
      parsed.protocol !== 'https:' &&
      !(
        parsed.protocol === 'http:' && ['127.0.0.1', 'localhost', '[::1]'].includes(parsed.hostname)
      )
    )
      throw new Error('TLS_REQUIRED');
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
      while (this.journal.state.pending.length) {
        const event = this.journal.state.pending[0]!;
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
    let result: unknown;
    try {
      if (!this.native) throw new Error('NATIVE_EXECUTION_NOT_GRANTED');
      const manager = this.native.workspaces,
        workspace = manager.load(job.workspaceId);
      if (
        workspace.projectId !== job.projectId ||
        workspace.workId !== job.workId ||
        manager.state(workspace.path).head !== job.expectedHead
      )
        throw new Error('WORKSPACE_HEAD_CHANGED');
      if (job.kind === 'diff') {
        const diff = manager.diff(workspace.id);
        result = {
          jobId: job.id,
          status: 'succeeded',
          diff: {
            ...diff,
            text: diff.text.slice(0, 60000),
            untracked: diff.untracked.slice(0, 1000),
            truncated: diff.text.length > 60000 || diff.untracked.length > 1000,
          },
        };
      } else if (job.kind === 'integrate') {
        const spec = job.payload.integrate;
        if (!spec) throw new Error('INTEGRATION_SPEC_REQUIRED');
        const integration = await integrate({
          repository: workspace.repository,
          baseBranch: spec.baseBranch,
          expectedBase: spec.expectedBase,
          headSha: job.expectedHead,
          candidate: spec.candidate,
          scratchDir: manager.scratch('integrations'),
          hooksDir: manager.hooks,
          author: { name: 'AETHER integration', email: 'aether@localhost' },
        });
        result = { jobId: job.id, status: 'succeeded', integration };
      } else {
        const requested = job.payload.verifier,
          harness = requested ? this.native.verifiers.get(requested.name) : undefined;
        if (!harness || harness.sourceHash !== requested?.sourceHash)
          throw new Error('VERIFIER_CHANGED');
        const verification = await manager.verify(workspace.id, harness.id, abort.signal);
        result = { jobId: job.id, status: 'succeeded', verification };
      }
    } catch (error) {
      result = {
        jobId: job.id,
        status: 'failed',
        error:
          error instanceof Error && /^[A-Z_]+$/.test(error.message)
            ? error.message
            : 'WORKSPACE_JOB_FAILED',
      };
    }
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
  private async execute(command: RunCommand, abort: AbortController): Promise<void> {
    const base = { runId: command.runId, epoch: command.epoch };
    try {
      const started = async (providerSessionId: string, processIdentity: string) => {
        this.journal.state.runs[command.runId] = { command, state: 'running', processIdentity };
        this.enqueue({
          ...base,
          type: 'started',
          sourceEventId: randomUUID(),
          providerSessionId,
          processIdentity,
        });
      };
      let processIdentity: string | undefined;
      const nativeSink: NativeSink = {
        processStarted: async (identity) => {
          processIdentity = identity;
          this.journal.state.runs[command.runId]!.processIdentity = identity;
          this.journal.save();
        },
        event: async (event) => {
          if (event.kind === 'session.started') {
            if (!processIdentity) throw new Error('PROCESS_OWNERSHIP_REQUIRED');
            await started(event.providerSessionId, processIdentity);
          } else this.enqueue({ ...base, type: 'provider', sourceEventId: randomUUID(), event });
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
      if (command.provider !== 'demo' && !this.native)
        throw new Error('NATIVE_EXECUTION_NOT_GRANTED');
      const credential =
        command.provider !== 'demo'
          ? await this.api<{ token: string }>('/api/runner/session-credential', base)
          : undefined;
      const result =
        command.provider !== 'demo'
          ? await this.native!.run(
              command,
              nativeSink,
              async (workspace) => {
                this.enqueue({
                  ...base,
                  type: 'workspace',
                  sourceEventId: randomUUID(),
                  workspace,
                });
                await this.flush();
              },
              abort.signal,
              credential
                ? {
                    url: this.url,
                    token: credential.token,
                    projectId: command.projectId,
                    agentId: command.agentId,
                    workId: command.workId,
                    runId: command.runId,
                  }
                : undefined,
            )
          : await runFixture(
              command,
              {
                started: async (providerSessionId, processIdentity) => {
                  await started(providerSessionId, processIdentity);
                },
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
      this.journal.state.runs[command.runId]!.state = 'finished';
      this.journal.save();
      this.active.delete(command.runId);
    }
  }
  async tick(): Promise<void> {
    if (this.stopped || this.ticking) return;
    this.ticking = true;
    try {
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
      await this.flush();
      await this.flushJobs();
      await this.terminals?.tick();
      if (this.observers && !this.observing)
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
            if (code !== this.observerError) console.error(code);
            this.observerError = code;
          })
          .finally(() => {
            this.observing = undefined;
          });
      if (this.native && !this.activeJob) {
        const response = await this.api<{ job: RunnerJob | null }>('/api/runner/jobs/claim', {});
        if (response.job) {
          const job = runnerJobSchema.parse(response.job);
          this.journal.state.jobs[job.id] = { job, state: 'running' };
          this.journal.save();
          this.activeJob = new AbortController();
          this.activeJobId = job.id;
          void this.executeJob(job, this.activeJob).catch(() => {
            this.stop();
            console.error('WORKSPACE_JOB_JOURNAL_FAILURE');
          });
        }
      }
      if (this.active.size >= 2) return;
      const { command } = await this.api<{ command: RunCommand | null }>('/api/runner/claim', {
        providers: ['demo', ...(this.native?.providers ?? [])],
      });
      if (command && this.journal.accept(command)) {
        const abort = new AbortController();
        this.active.set(command.runId, abort);
        void this.execute(command, abort).catch(() => {
          this.stopped = true;
          console.error('RUNNER_JOURNAL_FAILURE: dispatch stopped to preserve evidence');
        });
      }
    } finally {
      this.ticking = false;
    }
  }
  start(): void {
    this.terminals?.recover();
    for (const entry of Object.values(this.journal.state.jobs))
      if (entry.state === 'running') {
        entry.state = 'finished';
        entry.result = {
          jobId: entry.job.id,
          status: 'failed',
          error: 'RUNNER_RESTARTED_RESULT_UNKNOWN',
        };
        this.journal.save();
      }
    for (const run of Object.values(this.journal.state.runs)) {
      if (run.state === 'finished') continue;
      // Never signal a persisted PID: the previous process may be gone or its PID reused.
      this.enqueue({
        type: 'result',
        sourceEventId: randomUUID(),
        runId: run.command.runId,
        epoch: run.command.epoch,
        outcome: 'indeterminate',
        summary:
          'Runner restarted during execution. Process ownership must be reconciled; no automatic retry.',
      });
      run.state = 'finished';
      this.journal.save();
    }
    const loop = async () => {
      try {
        await this.tick();
      } catch (error) {
        console.error(error instanceof Error ? error.message : 'RUNNER_OFFLINE');
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
