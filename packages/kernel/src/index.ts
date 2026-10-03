/** Pure business policies. No filesystem, database, transport or rendering imports. */
export type Role = 'owner' | 'operator' | 'reviewer' | 'viewer' | 'agent' | 'runner';
export type Actor = {
  id: string;
  role: Role;
  projectIds: readonly string[];
  agentId?: string;
  machineId?: string;
  workId?: string;
  runId?: string;
  runPurpose?: string;
};
export type Action =
  | 'terminal.start'
  | 'terminal.takeover'
  | 'terminal.release'
  | 'terminal.input'
  | 'terminal.resize'
  | 'terminal.stop'
  | 'read'
  | 'workspace.diff'
  | 'project.execution.configure'
  | 'project.create'
  | 'agent.register'
  | 'work.create'
  | 'work.request_review'
  | 'work.assign'
  | 'work.dependencies'
  | 'work.retry'
  | 'work.extend'
  | 'work.claim'
  | 'work.progress'
  | 'work.submit'
  | 'work.review'
  | 'work.verify'
  | 'work.accept'
  | 'work.cancel'
  | 'message.send'
  | 'message.ack'
  | 'approval.decide'
  | 'layout.save'
  | 'runner.report'
  | 'identity.manage'
  | 'knowledge.propose'
  | 'knowledge.approve'
  | 'reservation.manage';
const grants: Record<Role, readonly Action[]> = {
  owner: [
    'terminal.start',
    'terminal.takeover',
    'terminal.release',
    'terminal.input',
    'terminal.resize',
    'terminal.stop',
    'work.extend',
    'read',
    'workspace.diff',
    'project.execution.configure',
    'project.create',
    'agent.register',
    'work.create',
    'work.request_review',
    'work.assign',
    'work.dependencies',
    'work.retry',
    'work.claim',
    'work.progress',
    'work.submit',
    'work.review',
    'work.verify',
    'work.accept',
    'work.cancel',
    'message.send',
    'message.ack',
    'approval.decide',
    'layout.save',
    'identity.manage',
    'knowledge.propose',
    'knowledge.approve',
    'reservation.manage',
  ],
  operator: [
    'terminal.start',
    'terminal.takeover',
    'terminal.release',
    'terminal.input',
    'terminal.resize',
    'terminal.stop',
    'read',
    'workspace.diff',
    'agent.register',
    'work.create',
    'work.request_review',
    'work.assign',
    'work.dependencies',
    'work.retry',
    'work.claim',
    'work.progress',
    'work.submit',
    'work.cancel',
    'message.send',
    'message.ack',
    'approval.decide',
    'layout.save',
    'knowledge.propose',
    'reservation.manage',
  ],
  reviewer: [
    'read',
    'workspace.diff',
    'work.review',
    'message.send',
    'message.ack',
    'knowledge.propose',
  ],
  viewer: ['read'],
  agent: [
    'read',
    'work.create',
    'work.claim',
    'work.progress',
    'work.submit',
    'message.send',
    'message.ack',
    'knowledge.propose',
    'reservation.manage',
  ],
  runner: ['read', 'runner.report', 'work.verify'],
};
export class DomainError extends Error {
  constructor(
    public readonly code: string,
    public readonly status = 409,
  ) {
    super(code);
    this.name = 'DomainError';
  }
}
export function authorize(actor: Actor, action: Action, projectId?: string): void {
  if (!grants[actor.role].includes(action)) throw new DomainError('FORBIDDEN', 403);
  if (projectId && !actor.projectIds.includes(projectId) && !actor.projectIds.includes('*'))
    throw new DomainError('PROJECT_FORBIDDEN', 403);
}
export type WorkState =
  | 'backlog'
  | 'ready'
  | 'assigned'
  | 'running'
  | 'reviewing'
  | 'changes_requested'
  | 'verified'
  | 'completed'
  | 'blocked'
  | 'cancel_requested'
  | 'cancelled'
  | 'failed'
  | 'indeterminate';
const transitions: Record<WorkState, readonly WorkState[]> = {
  backlog: ['ready', 'cancelled'],
  ready: ['backlog', 'assigned', 'blocked', 'cancelled'],
  assigned: ['running', 'cancel_requested', 'blocked', 'indeterminate'],
  running: ['reviewing', 'failed', 'blocked', 'cancel_requested', 'indeterminate'],
  reviewing: ['changes_requested', 'verified', 'cancel_requested'],
  changes_requested: ['ready', 'cancelled'],
  verified: ['completed', 'changes_requested', 'cancelled'],
  completed: [],
  blocked: ['ready', 'cancelled'],
  cancel_requested: ['cancelled', 'indeterminate'],
  cancelled: [],
  failed: ['ready', 'cancelled'],
  indeterminate: ['blocked', 'cancelled'],
};
export function assertTransition(from: WorkState, to: WorkState): void {
  if (!transitions[from].includes(to)) throw new DomainError('INVALID_TRANSITION');
}
export function assertVersion(actual: number, expected: number): void {
  if (actual !== expected) throw new DomainError('VERSION_CONFLICT');
}
export function assertAcyclic(
  id: string,
  dependencies: readonly string[],
  graph: ReadonlyMap<string, readonly string[]>,
): void {
  if (new Set(dependencies).size !== dependencies.length)
    throw new DomainError('DUPLICATE_DEPENDENCY', 400);
  for (const dep of dependencies)
    if (!graph.has(dep) && dep !== id) throw new DomainError('DEPENDENCY_NOT_FOUND', 404);
  const updated = new Map(graph).set(id, dependencies);
  const active = new Set<string>();
  const seen = new Set<string>();
  const visit = (node: string): void => {
    if (active.has(node)) throw new DomainError('DAG_CYCLE', 400);
    if (seen.has(node)) return;
    active.add(node);
    for (const dep of updated.get(node) ?? []) visit(dep);
    active.delete(node);
    seen.add(node);
  };
  visit(id);
}
export function assertOwnedAgent(actor: Actor, agentId: string): void {
  if (actor.role === 'agent' && actor.agentId !== agentId)
    throw new DomainError('RECIPIENT_FORBIDDEN', 403);
}
export type Usage = { input: number; output: number };
export function usageDelta(previous: Usage, cumulative: Usage): Usage {
  if (
    ![previous.input, previous.output, cumulative.input, cumulative.output].every(
      (n) => Number.isSafeInteger(n) && n >= 0,
    )
  )
    throw new DomainError('INVALID_USAGE', 400);
  return {
    input: Math.max(0, cumulative.input - previous.input),
    output: Math.max(0, cumulative.output - previous.output),
  };
}
export function nextOccurrence(
  dueAt: number,
  now: number,
  intervalMs: number | null,
  missed: 'skip' | 'single',
): { dispatch: boolean; nextAt: number | null } {
  if (dueAt > now) return { dispatch: false, nextAt: dueAt };
  if (intervalMs !== null && (!Number.isSafeInteger(intervalMs) || intervalMs < 60000))
    throw new DomainError('INVALID_INTERVAL', 400);
  return {
    dispatch: missed === 'single' || now - dueAt < 60000,
    nextAt:
      intervalMs === null
        ? null
        : dueAt + (Math.floor((now - dueAt) / intervalMs) + 1) * intervalMs,
  };
}

export { validateLayout, objectBounds, objectSize } from './layout.js';
