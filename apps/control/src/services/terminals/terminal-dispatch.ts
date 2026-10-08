import { z } from 'zod';
import { terminalSnapshotSchema, type TerminalDispatch } from '@aether/contracts';
import {
  authorize,
  DomainError,
  terminalAgentState,
  type Actor,
  type TerminalAgentState,
} from '@aether/kernel';
import { identityActor } from '../domain/identity.js';
import { emit, type Context } from '../domain/context.js';
import { session, type Session } from './terminal-session.js';
import { machine } from '../runners/runner-machine.js';

/** A queued command as stored: the payload is JSON text until it is dispatched. */
type QueuedCommand = Omit<TerminalDispatch, 'payload'> & { payload: string };

/** Why a queued command can no longer run (its requester, session or lease changed since it was queued), if it cannot. */
function refusalOf(ctx: Context, row: QueuedCommand): DomainError | null {
  try {
    const requester = identityActor(ctx, row.identityId);
    authorize(requester, `terminal.${row.kind}`, row.projectId);
    const terminal = session(ctx, row.projectId, row.terminalId);
    if (row.kind === 'stop') return null;
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
    return null;
  } catch (error) {
    if (error instanceof DomainError) return error;
    throw error;
  }
}

/** Fails a command that can no longer run; a start that never ran also ends its session. */
function refuseCommand(ctx: Context, row: QueuedCommand, error: DomainError) {
  ctx.sqlite
    .prepare("UPDATE terminal_commands SET state='failed',payload='{}',result=? WHERE id=?")
    .run(error.code, row.id);
  if (row.kind === 'start')
    ctx.sqlite
      .prepare("UPDATE terminal_sessions SET state='exited',updatedAt=? WHERE id=?")
      .run(ctx.now(), row.terminalId);
}

/** The runner side of terminals: claim the next command, report its outcome and the screen it produced. */
export function claimTerminalCommand(ctx: Context, actor: Actor): TerminalDispatch | null {
  actor = machine(ctx, actor).actor;
  return ctx.sqlite
    .transaction(() => {
      const row = ctx.sqlite
        .prepare(
          "SELECT c.*,s.profile,s.profileHash,p.root FROM terminal_commands c JOIN terminal_sessions s ON s.id=c.terminalId JOIN projects p ON p.id=c.projectId WHERE s.machineId=? AND c.state='queued' ORDER BY c.createdAt,c.rowid LIMIT 1",
        )
        .get(actor.machineId) as QueuedCommand | undefined;
      if (!row) return null;
      authorize(actor, 'runner.report', row.projectId);
      const refusal = refusalOf(ctx, row);
      if (refusal) {
        refuseCommand(ctx, row, refusal);
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
        payload: JSON.parse(row.payload) as TerminalDispatch['payload'],
        identityId: row.identityId,
        controlEpoch: row.controlEpoch,
      };
    })
    .immediate();
}

const commandReportSchema = z
  .object({
    commandId: z.string().uuid(),
    status: z.enum(['applied', 'failed', 'indeterminate']),
    error: z.string().max(200).optional(),
  })
  .strict();

/** Stores the runner's outcome of a dispatched command; a session whose start failed or whose outcome is unknown ends. */
function recordCommandResult(
  ctx: Context,
  row: { id: string; terminalId: string; kind: string; state: string },
  data: z.infer<typeof commandReportSchema>,
) {
  const result = JSON.stringify(data);
  ctx.sqlite
    .prepare("UPDATE terminal_commands SET state=?,result=?,payload='{}' WHERE id=?")
    .run(row.state === 'indeterminate' ? 'indeterminate' : data.status, result, row.id);
  if (data.status === 'indeterminate' || (row.kind === 'start' && data.status === 'failed'))
    ctx.sqlite
      .prepare('UPDATE terminal_sessions SET state=?,updatedAt=? WHERE id=?')
      .run(data.status === 'indeterminate' ? 'indeterminate' : 'exited', ctx.now(), row.terminalId);
}

export function reportTerminalCommand(ctx: Context, actor: Actor, input: unknown) {
  actor = machine(ctx, actor).actor;
  const data = commandReportSchema.parse(input);
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
      if (row.result) {
        if (row.result !== JSON.stringify(data)) throw new DomainError('TERMINAL_RESULT_CONFLICT');
        return { duplicate: true };
      }
      if (!['dispatched', 'indeterminate'].includes(row.state))
        throw new DomainError('TERMINAL_COMMAND_NOT_DISPATCHED');
      recordCommandResult(ctx, row, data);
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
/** What the agent is doing, from the screen the runner just reported; a report with no output keeps what was known. */
function agentStateOf(
  state: string,
  chunks: readonly { data: string }[],
  known: TerminalAgentState | null,
): TerminalAgentState | null {
  if (state !== 'running') return null;
  return chunks.length ? terminalAgentState(chunks.map((c) => c.data).join('')) : known;
}
export function reportTerminalSnapshot(ctx: Context, actor: Actor, input: unknown) {
  actor = machine(ctx, actor).actor;
  const data = terminalSnapshotSchema.parse(input);
  return ctx.sqlite
    .transaction(() => {
      const row = ctx.sqlite
        .prepare('SELECT * FROM terminal_sessions WHERE id=? AND machineId=?')
        .get(data.terminalId, actor.machineId) as
        (Session & { snapshot: string | null; agentState: TerminalAgentState | null }) | undefined;
      if (!row) throw new DomainError('TERMINAL_NOT_FOUND', 404);
      authorize(actor, 'runner.report', row.projectId);
      const prior = row.snapshot ? terminalSnapshotSchema.parse(JSON.parse(row.snapshot)) : null;
      if (prior && data.cursor < prior.cursor) throw new DomainError('TERMINAL_STALE_SNAPSHOT');
      if (row.state === 'exited' && data.state !== 'exited')
        throw new DomainError('TERMINAL_EXITED');
      if (
        data.chunks.some(
          (c, i) =>
            c.seq > data.cursor || (i > 0 && c.seq <= (data.chunks[i - 1]?.seq ?? Infinity)),
        )
      )
        throw new DomainError('TERMINAL_INVALID_SEQUENCE');
      const state =
        ['indeterminate', 'stopping'].includes(row.state) && data.state === 'running'
          ? row.state
          : data.state;
      ctx.sqlite
        .prepare(
          'UPDATE terminal_sessions SET state=?,snapshot=?,cols=?,rows=?,updatedAt=?,agentState=? WHERE id=?',
        )
        .run(
          state,
          JSON.stringify({ ...data, state }),
          data.dimensions.cols,
          data.dimensions.rows,
          ctx.now(),
          agentStateOf(state, data.chunks, row.agentState),
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
