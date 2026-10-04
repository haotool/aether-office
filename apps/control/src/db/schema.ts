import type { Activity, Mode, Provider } from '@aether/contracts';
import type { Role, WorkState } from '@aether/kernel';
import { table } from './query.js';

// The shape of the rows the control plane reads and writes through db/query.ts. The tables themselves are created by
// migration.sql and migrations/; a test keeps the two in step.
export type ProjectRow = {
  id: string;
  name: string;
  root: string | null;
  mode: Mode;
  version: number;
  createdAt: number;
};
export type AgentRow = {
  id: string;
  projectId: string;
  name: string;
  role: string;
  provider: Provider;
  mode: Mode;
  species: string;
  color: string;
  activity: Activity;
  version: number;
  createdAt: number;
  lastSeen: number | null;
};
export type WorkRow = {
  id: string;
  projectId: string;
  title: string;
  description: string;
  acceptance: string;
  state: WorkState;
  assignee: string | null;
  version: number;
  priority: number;
  createdAt: number;
  updatedAt: number;
  attempt: number;
  maxAttempts: number;
  cancelCause: string | null;
  result: string | null;
  submittedBy: string | null;
  headSha: string | null;
  reviewBy: string | null;
  verifiedSha: string | null;
};
export type DependencyRow = { workId: string; dependsOn: string; projectId: string };
export type MessageRow = {
  id: string;
  projectId: string;
  threadId: string;
  replyTo: string | null;
  senderId: string;
  body: string;
  kind: string;
  createdAt: number;
  expiresAt: number;
  roomId: string | null;
};
export type IdentityRow = {
  id: string;
  role: Role;
  name: string;
  tokenHash: string;
  projectIds: string[];
  agentId: string | null;
  machineId: string | null;
  revokedAt: number | null;
  createdAt: number;
  expiresAt: number | null;
};
export type KnowledgeRow = {
  id: string;
  projectId: string;
  title: string;
  body: string;
  source: string;
  author: string;
  classification: string;
  version: number;
  createdAt: number;
  updatedAt: number;
  reviewedBy: string | null;
  reviewReason: string | null;
  workId: string | null;
  artifactId: string | null;
  commitSha: string | null;
};

export const projects = table<ProjectRow>('projects', [
  'id',
  'name',
  'root',
  'mode',
  'version',
  'createdAt',
]);
export const agents = table<AgentRow>('agents', [
  'id',
  'projectId',
  'name',
  'role',
  'provider',
  'mode',
  'species',
  'color',
  'activity',
  'version',
  'createdAt',
  'lastSeen',
]);
export const work = table<WorkRow>('work_items', [
  'id',
  'projectId',
  'title',
  'description',
  'acceptance',
  'state',
  'assignee',
  'version',
  'priority',
  'createdAt',
  'updatedAt',
  'attempt',
  'maxAttempts',
  'cancelCause',
  'result',
  'submittedBy',
  'headSha',
  'reviewBy',
  'verifiedSha',
]);
export const dependencies = table<DependencyRow>('task_dependencies', [
  'workId',
  'dependsOn',
  'projectId',
]);
export const messages = table<MessageRow>('messages', [
  'id',
  'projectId',
  'threadId',
  'replyTo',
  'senderId',
  'body',
  'kind',
  'createdAt',
  'expiresAt',
  'roomId',
]);
export const identities = table<IdentityRow>(
  'identities',
  [
    'id',
    'role',
    'name',
    'tokenHash',
    'projectIds',
    'agentId',
    'machineId',
    'revokedAt',
    'createdAt',
    'expiresAt',
  ],
  ['projectIds'],
);
export const knowledge = table<KnowledgeRow>('knowledge', [
  'id',
  'projectId',
  'title',
  'body',
  'source',
  'author',
  'classification',
  'version',
  'createdAt',
  'updatedAt',
  'reviewedBy',
  'reviewReason',
  'workId',
  'artifactId',
  'commitSha',
]);
