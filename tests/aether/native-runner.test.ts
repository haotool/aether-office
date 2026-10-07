import { it, expect } from 'vitest';
import { mkdtempSync, writeFileSync, rmSync, readFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
import { pathToFileURL } from 'node:url';
import { execFileSync } from 'node:child_process';
import { setTimeout as delay } from 'node:timers/promises';
import { Control } from '../../apps/control/src/control.js';
import { createServer } from '../../apps/control/src/server.js';
import { enroll, claim } from '../../apps/control/src/services/runners.js';
import { Runner } from '../../apps/runner/src/runner.js';
import { NativeExecutor } from '../../apps/runner/src/native.js';
import { Journal } from '../../apps/runner/src/journal.js';
import { command } from './fixture.js';
import { freePort } from './timing.js';
it('runs a synthetic app-server through real HTTP, isolated Git, durable approval and tool/usage projections', async () => {
  const directory = mkdtempSync(join(tmpdir(), 'aether-native-wire-'));
  const repository = join(directory, 'repo');
  execFileSync('git', ['init', '-q', repository]);
  writeFileSync(join(repository, 'file.txt'), 'base');
  execFileSync('git', ['-C', repository, 'add', 'file.txt']);
  execFileSync('git', [
    '-C',
    repository,
    '-c',
    'user.name=Fixture',
    '-c',
    'user.email=fixture@example.invalid',
    'commit',
    '-qm',
    'base',
  ]);
  const binary = join(directory, 'synthetic-codex');
  writeFileSync(
    binary,
    `#!${process.execPath}\nif(process.argv.includes('--version'))console.log('codex-cli 0.159.2');else await import(${JSON.stringify(pathToFileURL(resolve('fixtures/processes/codex-app-server.mjs')).href)});\n`,
    { mode: 0o700 },
  );
  const control = new Control(join(directory, 'control.sqlite'), { mode: 'live' });
  const port = await freePort();
  const app = createServer(control, { origin: `http://127.0.0.1:${port}` });
  const owner = control.createIdentity(undefined, {
    name: 'Test owner',
    role: 'owner',
    projectIds: ['*'],
  });
  const projectId = String(
    control.execute(
      owner.actor,
      command('project.create', { name: 'Synthetic native transport', root: repository }),
    ).result['id'],
  );
  const agentId = String(
    control.execute(
      owner.actor,
      command(
        'agent.register',
        {
          name: 'Synthetic Codex',
          role: 'Engineer',
          provider: 'codex',
          species: 'fox',
          color: '#44aabb',
        },
        projectId,
      ),
    ).result['id'],
  );
  const workId = String(
    control.execute(
      owner.actor,
      command(
        'work.create',
        {
          title: 'Synthetic wire fixture',
          description: 'No paid model',
          acceptance: 'Durable approval',
        },
        projectId,
      ),
    ).result['id'],
  );
  expect(() =>
    control.execute(owner.actor, command('work.assign', { workId, agentId }, projectId, 1)),
  ).toThrow('LIVE_EXECUTION_NOT_ENABLED');
  const operator = control.createIdentity(owner.actor, {
    name: 'operator',
    role: 'operator',
    projectIds: [projectId],
  });
  const policy = { liveEnabled: true, maxTurns: 1, timeoutMs: 10000 };
  expect(() =>
    control.execute(operator.actor, command('project.execution.configure', policy, projectId, 0)),
  ).toThrow('FORBIDDEN');
  control.execute(owner.actor, command('project.execution.configure', policy, projectId, 0));
  const machine = enroll(control.ctx, owner.actor, 'wire fixture machine', [projectId]);
  const verifier = join(directory, 'verify.mjs');
  writeFileSync(
    verifier,
    "import assert from 'node:assert/strict';import {readFileSync} from 'node:fs';assert.equal(readFileSync('file.txt','utf8'),'base');",
  );
  const native = new NativeExecutor(join(directory, 'workspaces'), {
    enabled: true,
    repositories: [repository],
    verifiers: { test: { file: verifier, timeoutMs: 3000 } },
    binaries: { codex: binary },
  });
  const runner = new Runner(
    `http://127.0.0.1:${port}`,
    machine.token,
    new Journal(join(directory, 'journal.json')),
    native,
  );
  try {
    await app.listen({ host: '127.0.0.1', port });
    control.execute(owner.actor, command('work.assign', { workId, agentId }, projectId, 1));
    runner.start();
    let approval: { id: string; actionHash: string } | undefined;
    for (let i = 0; i < 100 && !approval; i++) {
      await delay(50);
      approval = control.ctx.sqlite
        .prepare('SELECT id,actionHash FROM approval_decisions')
        .get() as typeof approval;
    }
    expect(approval).toBeDefined();
    control.execute(
      owner.actor,
      command(
        'approval.decide',
        { approvalId: approval!.id, actionHash: approval!.actionHash, decision: 'approve' },
        projectId,
        1,
      ),
    );
    for (let i = 0; i < 150; i++) {
      await delay(50);
      if (control.snapshot(owner.actor, projectId).work[0]?.state === 'reviewing') break;
    }
    expect(control.snapshot(owner.actor, projectId).work[0]).toMatchObject({
      state: 'reviewing',
      result: expect.stringContaining('Fixture answer'),
    });
    expect(control.ctx.sqlite.prepare('SELECT COUNT(*) AS n FROM workspaces').get()).toEqual({
      n: 1,
    });
    expect(control.ctx.sqlite.prepare('SELECT state FROM tool_invocations').get()).toEqual({
      state: 'failed',
    });
    expect(
      control.ctx.sqlite.prepare('SELECT inputTokens,outputTokens FROM usage_totals').get(),
    ).toEqual({ inputTokens: 10, outputTokens: 5 });
    expect(control.ctx.sqlite.prepare('SELECT state FROM approval_decisions').get()).toEqual({
      state: 'provider_acknowledged',
    });
    expect(JSON.stringify(control.events(owner.actor, projectId, '0'))).not.toContain(
      'PRIVATE_REASONING',
    );
    await runner.flush();
    expect(runner.journal.state.pending).toHaveLength(0);
    const first = control.snapshot(owner.actor, projectId).work[0]!;
    const workspace = control.ctx.sqlite
      .prepare('SELECT id,path FROM workspaces WHERE workId=?')
      .get(workId) as { id: string; path: string };
    writeFileSync(join(workspace.path, 'retry-committed.txt'), 'preserved commit');
    execFileSync('git', ['-C', workspace.path, 'add', 'retry-committed.txt']);
    execFileSync('git', [
      '-C',
      workspace.path,
      '-c',
      'user.name=Fixture',
      '-c',
      'user.email=fixture@example.invalid',
      'commit',
      '-qm',
      'prior attempt',
    ]);
    writeFileSync(join(workspace.path, 'retry-dirty.txt'), 'preserved dirty work');
    control.execute(
      owner.actor,
      command(
        'work.review',
        {
          workId,
          decision: 'changes_requested',
          body: 'Keep earlier files and fix the implementation',
        },
        projectId,
        first.version,
      ),
    );
    const rejected = control.snapshot(owner.actor, projectId).work[0]!;
    const retry = command('work.retry', { workId, resume: true }, projectId, rejected.version);
    const receipt = control.execute(owner.actor, retry);
    expect(control.execute(owner.actor, retry)).toEqual(receipt);
    expect(receipt.result).toMatchObject({
      state: 'assigned',
      attempt: 2,
      reviewBy: null,
      verifiedSha: null,
      headSha: null,
      result: null,
    });
    const other = enroll(control.ctx, owner.actor, 'wrong retry machine', [projectId]);
    expect(claim(control.ctx, other.actor, ['codex'])).toBeNull();
    let nextApproval: typeof approval;
    for (let i = 0; i < 100 && !nextApproval; i++) {
      await delay(50);
      nextApproval = control.ctx.sqlite
        .prepare("SELECT id,actionHash FROM approval_decisions WHERE state='pending'")
        .get() as typeof approval;
    }
    expect(nextApproval).toBeDefined();
    expect(nextApproval!.id).not.toBe(approval!.id);
    control.execute(
      owner.actor,
      command(
        'approval.decide',
        { approvalId: nextApproval!.id, actionHash: nextApproval!.actionHash, decision: 'approve' },
        projectId,
        1,
      ),
    );
    for (let i = 0; i < 150; i++) {
      await delay(50);
      if (control.snapshot(owner.actor, projectId).work[0]?.state === 'reviewing') break;
    }
    expect(control.snapshot(owner.actor, projectId).work[0]?.state).toBe('reviewing');
    expect(control.ctx.sqlite.prepare('SELECT COUNT(*) AS n FROM workspaces').get()).toEqual({
      n: 1,
    });
    expect(control.snapshot(owner.actor, projectId).work[0]?.result).toContain(
      'Fixture answer resumed',
    );
    expect(
      control.ctx.sqlite
        .prepare(
          'SELECT SUM(inputTokens) AS inputTokens,SUM(outputTokens) AS outputTokens FROM usage_totals',
        )
        .get(),
    ).toEqual({ inputTokens: 14, outputTokens: 8 });
    expect(readFileSync(join(workspace.path, 'retry-committed.txt'), 'utf8')).toBe(
      'preserved commit',
    );
    expect(readFileSync(join(workspace.path, 'retry-dirty.txt'), 'utf8')).toBe(
      'preserved dirty work',
    );
    rmSync(join(workspace.path, 'retry-dirty.txt'));
    const submitted = control.snapshot(owner.actor, projectId).work[0]!;
    control.execute(
      owner.actor,
      command(
        'work.review',
        { workId, decision: 'approve', body: 'Synthetic transport reviewed' },
        projectId,
        submitted.version,
      ),
    );
    const reviewed = control.snapshot(owner.actor, projectId).work[0]!;
    const verification = control.execute(
      owner.actor,
      command('work.verify', { workId, verifier: 'test' }, projectId, reviewed.version),
    );
    for (let i = 0; i < 100; i++) {
      await delay(50);
      if (control.snapshot(owner.actor, projectId).work[0]?.state === 'verified') break;
    }
    const verified = control.snapshot(owner.actor, projectId).work[0]!;
    expect(verified.state).toBe('verified');
    expect(verified.verifiedSha).toBe(verified.headSha);
    expect(
      control.ctx.sqlite
        .prepare('SELECT state FROM runner_jobs WHERE id=?')
        .get(verification.result['id']),
    ).toEqual({ state: 'succeeded' });
    control.execute(owner.actor, command('work.accept', { workId }, projectId, verified.version));
    expect(control.snapshot(owner.actor, projectId).work[0]?.state).toBe('completed');
    // Integrate the accepted commit through the real runner into a local candidate branch.
    const git = (...args: string[]) =>
      execFileSync('git', ['-C', repository, ...args], { encoding: 'utf8' }).trim();
    const baseBranch = git('rev-parse', '--abbrev-ref', 'HEAD');
    const baseBefore = git('rev-parse', baseBranch);
    const accepted = control.snapshot(owner.actor, projectId).work[0]!;
    const integration = control.execute(
      owner.actor,
      command(
        'work.integrate',
        { workId, baseBranch, expectedBase: baseBefore },
        projectId,
        accepted.version,
      ),
    );
    for (let i = 0; i < 100; i++) {
      await delay(50);
      if (
        control.ctx.sqlite
          .prepare("SELECT 1 FROM integrations WHERE jobId=? AND status='merged'")
          .get(integration.result['id'])
      )
        break;
    }
    const merged = control.ctx.sqlite
      .prepare('SELECT candidate,mergeSha,headSha FROM integrations WHERE jobId=?')
      .get(integration.result['id']) as { candidate: string; mergeSha: string; headSha: string };
    expect(merged.headSha).toBe(accepted.headSha);
    expect(git('rev-parse', merged.candidate)).toBe(merged.mergeSha);
    expect(git('rev-parse', baseBranch)).toBe(baseBefore); // base branch never moved
    // Revoking project execution cancels queued work before any provider starts.
    const next = control.execute(
      owner.actor,
      command(
        'work.create',
        { title: 'Cancel queued', description: '', acceptance: 'no execution' },
        projectId,
      ),
    );
    control.execute(
      owner.actor,
      command('work.assign', { workId: next.result['id'], agentId }, projectId, 1),
    );
    control.execute(
      owner.actor,
      command('project.execution.configure', { ...policy, liveEnabled: false }, projectId, 1),
    );
    expect(
      control.snapshot(owner.actor, projectId).work.find((w) => w.id === next.result['id'])?.state,
    ).toBe('cancelled');
  } finally {
    await runner.shutdown();
    await app.close();
    control.close();
    rmSync(directory, { recursive: true, force: true });
  }
}, 30000);
