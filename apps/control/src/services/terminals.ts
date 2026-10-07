import { randomUUID } from 'node:crypto';
import { type Command } from '@aether/contracts';
import { authorize, DomainError, type Actor, type TerminalAgentState } from '@aether/kernel';
import { identityActor } from './identity.js';
import { project, emit, type Context } from './context.js';
import { session, type Session } from './terminal-session.js';

type TerminalCommand = Extract<Command, { type: `terminal.${string}` }>;
type Project = ReturnType<typeof project>;
const LEASE_MS = 30000;

/** The profile the machine grants for this project's root; the machine must be live, in the project and under its capacity. */
function grantedProfile(
  ctx: Context,
  p: Project,
  data: { machineId: string; profile: string },
  now: number,
) {
  const machine = ctx.sqlite
    .prepare(
      'SELECT projectIds,terminalProfiles FROM machines WHERE id=? AND revokedAt IS NULL AND lastSeen>=?',
    )
    .get(data.machineId, now - 45000) as
    { projectIds: string; terminalProfiles: string } | undefined;
  if (!machine || !(JSON.parse(machine.projectIds) as string[]).includes(p.id))
    throw new DomainError('TERMINAL_MACHINE_UNAVAILABLE');
  const profile = (
    JSON.parse(machine.terminalProfiles) as { name: string; hash: string; root: string }[]
  ).find((v) => v.name === data.profile && v.root === p.root);
  if (!profile) throw new DomainError('TERMINAL_PROFILE_NOT_GRANTED', 403);
  const count = ctx.sqlite
    .prepare(
      "SELECT COUNT(*) AS n FROM terminal_sessions WHERE machineId=? AND state IN ('queued','running','stopping','indeterminate')",
    )
    .get(data.machineId) as { n: number };
  if (count.n >= 4) throw new DomainError('TERMINAL_CAPACITY');
  return profile;
}

/** terminal.start: records the new session and returns its id. */
function createSession(
  ctx: Context,
  actor: Actor,
  c: Extract<Command, { type: 'terminal.start' }>,
  now: number,
): string {
  const p = project(ctx, actor, c.projectId);
  if (
    p.mode !== 'live' ||
    !ctx.sqlite
      .prepare('SELECT 1 FROM project_policies WHERE projectId=? AND liveEnabled=1')
      .get(p.id)
  )
    throw new DomainError('LIVE_EXECUTION_NOT_ENABLED', 403);
  const profile = grantedProfile(ctx, p, c.data, now);
  const terminalId = randomUUID();
  ctx.sqlite
    .prepare(
      'INSERT INTO terminal_sessions(id,projectId,machineId,profile,profileHash,cols,rows,createdAt,updatedAt) VALUES (?,?,?,?,?,?,?,?,?)',
    )
    .run(
      terminalId,
      p.id,
      c.data.machineId,
      profile.name,
      profile.hash,
      c.data.cols,
      c.data.rows,
      now,
      now,
    );
  return terminalId;
}

function takeOver(ctx: Context, actor: Actor, row: Session, now: number) {
  if (row.state !== 'running') throw new DomainError('TERMINAL_NOT_RUNNING');
  if (row.controlOwner && row.controlOwner !== actor.id && (row.leaseUntil ?? 0) > now)
    throw new DomainError('TERMINAL_ALREADY_CONTROLLED');
  ctx.sqlite
    .prepare(
      'UPDATE terminal_sessions SET controlOwner=?,controlEpoch=controlEpoch+1,leaseUntil=?,updatedAt=? WHERE id=?',
    )
    .run(actor.id, now + LEASE_MS, now, row.id);
  return {
    id: row.id,
    controlEpoch: row.controlEpoch + 1,
    controlOwner: actor.id,
    leaseUntil: now + LEASE_MS,
  };
}

/** terminal.stop: drops what is queued; an unstarted session exits at once, a running one is asked to stop. */
function requestStop(ctx: Context, row: Session, now: number) {
  if (row.state === 'stopping') return { id: row.id, state: 'stopping' };
  ctx.sqlite
    .prepare(
      "UPDATE terminal_commands SET state='failed',payload='{}',result='TERMINAL_STOP_REQUESTED' WHERE terminalId=? AND state='queued'",
    )
    .run(row.id);
  const dispatched = ctx.sqlite
    .prepare(
      "SELECT 1 FROM terminal_commands WHERE terminalId=? AND kind='start' AND state='dispatched'",
    )
    .get(row.id);
  const state = row.state === 'queued' && !dispatched ? 'exited' : 'stopping';
  ctx.sqlite
    .prepare(
      'UPDATE terminal_sessions SET state=?,controlOwner=NULL,controlEpoch=controlEpoch+1,leaseUntil=NULL,updatedAt=? WHERE id=?',
    )
    .run(state, now, row.id);
  return state === 'exited' ? { id: row.id, state: 'exited' } : undefined;
}

function releaseControl(ctx: Context, row: Session, now: number) {
  ctx.sqlite
    .prepare(
      'UPDATE terminal_sessions SET controlOwner=NULL,controlEpoch=controlEpoch+1,leaseUntil=NULL,updatedAt=? WHERE id=?',
    )
    .run(now, row.id);
  return { id: row.id, controlEpoch: row.controlEpoch + 1, controlOwner: null };
}

/**
 * Input, resize and release need the caller's live control lease; input and resize also renew it.
 * Returns the final answer when the command completes here (takeover, release, a stop that ends the session).
 */
function applyToSession(ctx: Context, actor: Actor, c: TerminalCommand, row: Session, now: number) {
  if (c.type === 'terminal.takeover') return takeOver(ctx, actor, row, now);
  if (c.type === 'terminal.stop') return requestStop(ctx, row, now);
  if (row.controlOwner !== actor.id || (row.leaseUntil ?? 0) <= now)
    throw new DomainError('TERMINAL_CONTROL_REQUIRED', 403);
  if (c.type === 'terminal.release') return releaseControl(ctx, row, now);
  if (row.state !== 'running') throw new DomainError('TERMINAL_NOT_RUNNING');
  ctx.sqlite
    .prepare('UPDATE terminal_sessions SET leaseUntil=?,updatedAt=? WHERE id=?')
    .run(now + LEASE_MS, now, row.id);
  return undefined;
}

export function terminalCommand(ctx: Context, actor: Actor, c: TerminalCommand) {
  authorize(actor, c.type, c.projectId);
  const now = ctx.now();
  let terminalId: string,
    epoch = 0;
  if (c.type === 'terminal.start') {
    terminalId = createSession(ctx, actor, c, now);
  } else {
    const row = session(ctx, c.projectId, c.data.terminalId);
    terminalId = row.id;
    epoch = row.controlEpoch;
    if (row.state === 'exited') throw new DomainError('TERMINAL_EXITED');
    if (c.data.epoch !== epoch) throw new DomainError('TERMINAL_EPOCH_MISMATCH');
    const done = applyToSession(ctx, actor, c, row, now);
    if (done) return done;
  }
  if (
    (
      ctx.sqlite
        .prepare(
          "SELECT COUNT(*) AS n FROM terminal_commands WHERE terminalId=? AND state IN ('queued','dispatched')",
        )
        .get(terminalId) as { n: number }
    ).n >= 128
  )
    throw new DomainError('TERMINAL_QUEUE_FULL', 429);
  const commandId = randomUUID(),
    kind = c.type.slice('terminal.'.length);
  ctx.sqlite
    .prepare(
      'INSERT INTO terminal_commands(id,terminalId,projectId,identityId,kind,payload,controlEpoch,createdAt) VALUES (?,?,?,?,?,?,?,?)',
    )
    .run(commandId, terminalId, c.projectId, actor.id, kind, JSON.stringify(c.data), epoch, now);
  // Raw keystrokes never enter command events or receipts.
  return { id: terminalId, terminalCommandId: commandId, state: 'queued', kind };
}
export function listTerminals(ctx: Context, actor: Actor, projectId: string) {
  actor = identityActor(ctx, actor.id);
  const p = project(ctx, actor, projectId);
  const profiles = ctx.sqlite
    .prepare(
      'SELECT id AS machineId,name,terminalProfiles FROM machines WHERE revokedAt IS NULL AND lastSeen>=? AND EXISTS (SELECT 1 FROM json_each(machines.projectIds) WHERE value=?)',
    )
    .all(ctx.now() - 45000, projectId) as {
    machineId: string;
    name: string;
    terminalProfiles: string;
  }[];
  return {
    sessions: ctx.sqlite
      .prepare(
        'SELECT id,profile,state,agentState,controlOwner,controlEpoch,leaseUntil,cols,rows,updatedAt FROM terminal_sessions WHERE projectId=? ORDER BY createdAt DESC LIMIT 100',
      )
      .all(projectId) as (Session & { agentState: TerminalAgentState | null })[],
    profiles: profiles.map((m) => ({
      ...m,
      terminalProfiles: JSON.stringify(
        (JSON.parse(m.terminalProfiles) as { root: string }[]).filter((v) => v.root === p.root),
      ),
    })),
  };
}
export function readTerminal(ctx: Context, actor: Actor, projectId: string, id: string) {
  actor = identityActor(ctx, actor.id);
  project(ctx, actor, projectId);
  session(ctx, projectId, id);
  return {
    ...(ctx.sqlite
      .prepare(
        'SELECT id,state,snapshot,controlOwner,controlEpoch,leaseUntil FROM terminal_sessions WHERE id=?',
      )
      .get(id) as Pick<Session, 'id' | 'state' | 'controlOwner' | 'controlEpoch' | 'leaseUntil'> & {
      snapshot: string | null;
    }),
    commands: ctx.sqlite
      .prepare(
        'SELECT id,kind,state,result FROM terminal_commands WHERE terminalId=? ORDER BY createdAt DESC,rowid DESC LIMIT 10',
      )
      .all(id),
  };
}

export function reconcileTerminals(ctx: Context) {
  return ctx.sqlite
    .transaction(() => {
      const rows = ctx.sqlite
        .prepare(
          "SELECT DISTINCT s.id,s.projectId FROM terminal_sessions s JOIN machines m ON m.id=s.machineId WHERE s.state IN ('queued','running','stopping') AND (m.revokedAt IS NOT NULL OR (s.state IN ('running','stopping') AND m.lastSeen<?) OR EXISTS (SELECT 1 FROM terminal_commands c WHERE c.terminalId=s.id AND c.state='dispatched' AND c.dispatchedAt<?))",
        )
        .all(ctx.now() - 45000, ctx.now() - 30000) as { id: string; projectId: string }[];
      for (const row of rows) {
        ctx.sqlite
          .prepare(
            "UPDATE terminal_sessions SET state='indeterminate',controlOwner=NULL,leaseUntil=NULL,updatedAt=? WHERE id=?",
          )
          .run(ctx.now(), row.id);
        ctx.sqlite
          .prepare(
            "UPDATE terminal_commands SET state=CASE WHEN state='queued' THEN 'failed' ELSE 'indeterminate' END,payload='{}' WHERE terminalId=? AND state IN ('queued','dispatched')",
          )
          .run(row.id);
        emit(
          ctx,
          { id: 'system', role: 'owner', projectIds: [] },
          row.projectId,
          'terminal.indeterminate',
          { terminalId: row.id },
          row.id,
          row.id,
        );
      }
      return rows.length;
    })
    .immediate();
}

export {
  claimTerminalCommand,
  reportTerminalCommand,
  reportTerminalSnapshot,
} from './terminal-dispatch.js';
