import { randomUUID } from 'node:crypto';
import { z } from 'zod';
import { type Command, terminalSnapshotSchema, type TerminalDispatch } from '@aether/contracts';
import { authorize, DomainError, type Actor } from '@aether/kernel';
import { identityActor } from './identity.js';
import { project, emit, type Context } from './context.js';
type Session = {
  id: string;
  projectId: string;
  machineId: string;
  state: string;
  controlOwner: string | null;
  controlEpoch: number;
  leaseUntil: number | null;
};
function session(ctx: Context, projectId: string, id: string): Session {
  const row = ctx.sqlite
    .prepare('SELECT * FROM terminal_sessions WHERE id=? AND projectId=?')
    .get(id, projectId) as Session | undefined;
  if (!row) throw new DomainError('TERMINAL_NOT_FOUND', 404);
  return row;
}
export function terminalCommand(
  ctx: Context,
  actor: Actor,
  c: Extract<Command, { type: `terminal.${string}` }>,
) {
  authorize(actor, c.type, c.projectId);
  const now = ctx.now();
  let terminalId: string,
    epoch = 0;
  if (c.type === 'terminal.start') {
    const p = project(ctx, actor, c.projectId);
    if (
      p.mode !== 'live' ||
      !ctx.sqlite
        .prepare('SELECT 1 FROM project_policies WHERE projectId=? AND liveEnabled=1')
        .get(p.id)
    )
      throw new DomainError('LIVE_EXECUTION_NOT_ENABLED', 403);
    const machine = ctx.sqlite
      .prepare(
        'SELECT projectIds,terminalProfiles FROM machines WHERE id=? AND revokedAt IS NULL AND lastSeen>=?',
      )
      .get(c.data.machineId, now - 45000) as
      { projectIds: string; terminalProfiles: string } | undefined;
    if (!machine || !(JSON.parse(machine.projectIds) as string[]).includes(p.id))
      throw new DomainError('TERMINAL_MACHINE_UNAVAILABLE');
    const profile = (
      JSON.parse(machine.terminalProfiles) as { name: string; hash: string; root: string }[]
    ).find((v) => v.name === c.data.profile && v.root === p.root);
    if (!profile) throw new DomainError('TERMINAL_PROFILE_NOT_GRANTED', 403);
    const count = ctx.sqlite
      .prepare(
        "SELECT COUNT(*) AS n FROM terminal_sessions WHERE machineId=? AND state IN ('queued','running','stopping','indeterminate')",
      )
      .get(c.data.machineId) as { n: number };
    if (count.n >= 4) throw new DomainError('TERMINAL_CAPACITY');
    terminalId = randomUUID();
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
  } else {
    const row = session(ctx, c.projectId, c.data.terminalId);
    terminalId = row.id;
    epoch = row.controlEpoch;
    if (row.state === 'exited') throw new DomainError('TERMINAL_EXITED');
    if (c.data.epoch !== epoch) throw new DomainError('TERMINAL_EPOCH_MISMATCH');
    if (c.type === 'terminal.takeover') {
      if (row.state !== 'running') throw new DomainError('TERMINAL_NOT_RUNNING');
      if (row.controlOwner && row.controlOwner !== actor.id && (row.leaseUntil ?? 0) > now)
        throw new DomainError('TERMINAL_ALREADY_CONTROLLED');
      ctx.sqlite
        .prepare(
          'UPDATE terminal_sessions SET controlOwner=?,controlEpoch=controlEpoch+1,leaseUntil=?,updatedAt=? WHERE id=?',
        )
        .run(actor.id, now + 30000, now, row.id);
      return {
        id: row.id,
        controlEpoch: epoch + 1,
        controlOwner: actor.id,
        leaseUntil: now + 30000,
      };
    }
    if (c.type === 'terminal.stop') {
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
      if (state === 'exited') return { id: row.id, state: 'exited' };
    }
    if (
      c.type !== 'terminal.stop' &&
      (row.controlOwner !== actor.id || (row.leaseUntil ?? 0) <= now)
    )
      throw new DomainError('TERMINAL_CONTROL_REQUIRED', 403);
    if (c.type === 'terminal.release') {
      ctx.sqlite
        .prepare(
          'UPDATE terminal_sessions SET controlOwner=NULL,controlEpoch=controlEpoch+1,leaseUntil=NULL,updatedAt=? WHERE id=?',
        )
        .run(now, row.id);
      return { id: row.id, controlEpoch: epoch + 1, controlOwner: null };
    }
    if (c.type !== 'terminal.stop' && row.state !== 'running')
      throw new DomainError('TERMINAL_NOT_RUNNING');
    if (c.type !== 'terminal.stop')
      ctx.sqlite
        .prepare('UPDATE terminal_sessions SET leaseUntil=?,updatedAt=? WHERE id=?')
        .run(now + 30000, now, row.id);
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
function runner(ctx: Context, actor: Actor) {
  actor = identityActor(ctx, actor.id);
  authorize(actor, 'runner.report');
  if (
    !ctx.sqlite
      .prepare('SELECT 1 FROM machines WHERE id=? AND revokedAt IS NULL')
      .get(actor.machineId)
  )
    throw new DomainError('MACHINE_REVOKED', 401);
  return actor;
}
export function claimTerminalCommand(ctx: Context, actor: Actor): TerminalDispatch | null {
  actor = runner(ctx, actor);
  return ctx.sqlite
    .transaction(() => {
      const row = ctx.sqlite
        .prepare(
          "SELECT c.*,s.profile,s.profileHash,p.root FROM terminal_commands c JOIN terminal_sessions s ON s.id=c.terminalId JOIN projects p ON p.id=c.projectId WHERE s.machineId=? AND c.state='queued' ORDER BY c.createdAt,c.rowid LIMIT 1",
        )
        .get(actor.machineId) as TerminalDispatch | undefined;
      if (!row) return null;
      authorize(actor, 'runner.report', row.projectId);
      try {
        const requester = identityActor(ctx, row.identityId);
        authorize(requester, `terminal.${row.kind}`, row.projectId);
        const terminal = session(ctx, row.projectId, row.terminalId);
        if (row.kind !== 'stop') {
          if (
            !ctx.sqlite
              .prepare('SELECT 1 FROM project_policies WHERE projectId=? AND liveEnabled=1')
              .get(row.projectId)
          )
            throw new DomainError('LIVE_EXECUTION_NOT_ENABLED');
          if (
            row.kind === 'start'
              ? terminal.state !== 'queued'
              : terminal.state !== 'running' ||
                terminal.controlEpoch !== row.controlEpoch ||
                terminal.controlOwner !== row.identityId ||
                (terminal.leaseUntil ?? 0) <= ctx.now()
          )
            throw new DomainError('TERMINAL_CONTROL_EXPIRED');
        }
      } catch (error) {
        if (!(error instanceof DomainError)) throw error;
        ctx.sqlite
          .prepare("UPDATE terminal_commands SET state='failed',payload='{}',result=? WHERE id=?")
          .run(error.code, row.id);
        if (row.kind === 'start')
          ctx.sqlite
            .prepare("UPDATE terminal_sessions SET state='exited',updatedAt=? WHERE id=?")
            .run(ctx.now(), row.terminalId);
        return null;
      }
      ctx.sqlite
        .prepare("UPDATE terminal_commands SET state='dispatched',dispatchedAt=? WHERE id=?")
        .run(ctx.now(), row.id);
      return {
        id: row.id,
        terminalId: row.terminalId,
        projectId: row.projectId,
        kind: row.kind,
        profile: row.profile,
        profileHash: row.profileHash,
        root: row.root,
        payload: JSON.parse(row.payload as unknown as string) as TerminalDispatch['payload'],
        identityId: row.identityId,
        controlEpoch: row.controlEpoch,
      };
    })
    .immediate();
}
export function reportTerminalCommand(ctx: Context, actor: Actor, input: unknown) {
  actor = runner(ctx, actor);
  const data = z
    .object({
      commandId: z.string().uuid(),
      status: z.enum(['applied', 'failed', 'indeterminate']),
      error: z.string().max(200).optional(),
    })
    .strict()
    .parse(input);
  return ctx.sqlite
    .transaction(() => {
      const row = ctx.sqlite
        .prepare(
          'SELECT c.*,s.machineId FROM terminal_commands c JOIN terminal_sessions s ON s.id=c.terminalId WHERE c.id=? AND s.machineId=?',
        )
        .get(data.commandId, actor.machineId) as
        | {
            id: string;
            projectId: string;
            terminalId: string;
            kind: string;
            state: string;
            result: string | null;
          }
        | undefined;
      if (!row) throw new DomainError('TERMINAL_COMMAND_NOT_FOUND', 404);
      authorize(actor, 'runner.report', row.projectId);
      const result = JSON.stringify(data);
      if (row.result) {
        if (row.result !== result) throw new DomainError('TERMINAL_RESULT_CONFLICT');
        return { duplicate: true };
      }
      if (!['dispatched', 'indeterminate'].includes(row.state))
        throw new DomainError('TERMINAL_COMMAND_NOT_DISPATCHED');
      ctx.sqlite
        .prepare("UPDATE terminal_commands SET state=?,result=?,payload='{}' WHERE id=?")
        .run(row.state === 'indeterminate' ? 'indeterminate' : data.status, result, row.id);
      if (data.status === 'indeterminate' || (row.kind === 'start' && data.status === 'failed'))
        ctx.sqlite
          .prepare('UPDATE terminal_sessions SET state=?,updatedAt=? WHERE id=?')
          .run(
            data.status === 'indeterminate' ? 'indeterminate' : 'exited',
            ctx.now(),
            row.terminalId,
          );
      emit(
        ctx,
        actor,
        row.projectId,
        'terminal.command.finished',
        { terminalId: row.terminalId, kind: row.kind, ...data },
        row.id,
        row.terminalId,
        'native',
      );
      return { duplicate: false };
    })
    .immediate();
}
export function reportTerminalSnapshot(ctx: Context, actor: Actor, input: unknown) {
  actor = runner(ctx, actor);
  const data = terminalSnapshotSchema.parse(input);
  return ctx.sqlite
    .transaction(() => {
      const row = ctx.sqlite
        .prepare('SELECT * FROM terminal_sessions WHERE id=? AND machineId=?')
        .get(data.terminalId, actor.machineId) as
        (Session & { snapshot: string | null }) | undefined;
      if (!row) throw new DomainError('TERMINAL_NOT_FOUND', 404);
      authorize(actor, 'runner.report', row.projectId);
      const prior = row.snapshot ? terminalSnapshotSchema.parse(JSON.parse(row.snapshot)) : null;
      if (prior && data.cursor < prior.cursor) throw new DomainError('TERMINAL_STALE_SNAPSHOT');
      if (row.state === 'exited' && data.state !== 'exited')
        throw new DomainError('TERMINAL_EXITED');
      if (
        data.chunks.some(
          (c, i) => c.seq > data.cursor || (i > 0 && c.seq <= data.chunks[i - 1]!.seq),
        )
      )
        throw new DomainError('TERMINAL_INVALID_SEQUENCE');
      const state =
        ['indeterminate', 'stopping'].includes(row.state) && data.state === 'running'
          ? row.state
          : data.state;
      ctx.sqlite
        .prepare(
          'UPDATE terminal_sessions SET state=?,snapshot=?,cols=?,rows=?,updatedAt=? WHERE id=?',
        )
        .run(
          state,
          JSON.stringify({ ...data, state }),
          data.dimensions.cols,
          data.dimensions.rows,
          ctx.now(),
          row.id,
        );
      if (state !== 'running')
        ctx.sqlite
          .prepare('UPDATE terminal_sessions SET controlOwner=NULL,leaseUntil=NULL WHERE id=?')
          .run(row.id);
      return { cursor: data.cursor };
    })
    .immediate();
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
        'SELECT id,profile,state,controlOwner,controlEpoch,leaseUntil,cols,rows,updatedAt FROM terminal_sessions WHERE projectId=? ORDER BY createdAt DESC LIMIT 100',
      )
      .all(projectId),
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
