import type { RunnerJob } from '@aether/contracts';
import { integrate } from './merge.js';
import type { NativeExecutor } from './native.js';
import type { Workspace, Workspaces } from './workspaces.js';

const DIFF_TEXT_LIMIT = 60000;
const DIFF_UNTRACKED_LIMIT = 1000;

function diffResult(manager: Workspaces, job: RunnerJob, workspace: Workspace) {
  const diff = manager.diff(workspace.id);
  return {
    jobId: job.id,
    status: 'succeeded',
    diff: {
      ...diff,
      text: diff.text.slice(0, DIFF_TEXT_LIMIT),
      untracked: diff.untracked.slice(0, DIFF_UNTRACKED_LIMIT),
      truncated: diff.text.length > DIFF_TEXT_LIMIT || diff.untracked.length > DIFF_UNTRACKED_LIMIT,
    },
  };
}

async function integrationResult(manager: Workspaces, job: RunnerJob, workspace: Workspace) {
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
  return { jobId: job.id, status: 'succeeded', integration };
}

async function verificationResult(
  native: NativeExecutor,
  job: RunnerJob,
  workspace: Workspace,
  signal: AbortSignal,
) {
  const requested = job.payload.verifier,
    harness = requested ? native.verifiers.get(requested.name) : undefined;
  if (!harness || harness.sourceHash !== requested?.sourceHash) throw new Error('VERIFIER_CHANGED');
  const verification = await native.workspaces.verify(workspace.id, harness.id, signal);
  return { jobId: job.id, status: 'succeeded', verification };
}

export async function runWorkspaceJob(
  native: NativeExecutor | undefined,
  job: RunnerJob,
  signal: AbortSignal,
): Promise<unknown> {
  try {
    if (!native) throw new Error('NATIVE_EXECUTION_NOT_GRANTED');
    const manager = native.workspaces,
      workspace = manager.load(job.workspaceId);
    if (
      workspace.projectId !== job.projectId ||
      workspace.workId !== job.workId ||
      manager.state(workspace.path).head !== job.expectedHead
    )
      throw new Error('WORKSPACE_HEAD_CHANGED');
    if (job.kind === 'diff') return diffResult(manager, job, workspace);
    if (job.kind === 'integrate') return await integrationResult(manager, job, workspace);
    return await verificationResult(native, job, workspace, signal);
  } catch (error) {
    return {
      jobId: job.id,
      status: 'failed',
      error:
        error instanceof Error && /^[A-Z_]+$/.test(error.message)
          ? error.message
          : 'WORKSPACE_JOB_FAILED',
    };
  }
}
