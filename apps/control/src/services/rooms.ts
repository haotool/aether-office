import { randomUUID } from 'node:crypto';
import type { Command, Room } from '@aether/contracts';
import { DomainError, type Actor } from '@aether/kernel';
import type { Context } from './context.js';

type Row = { id: string; name: string; createdAt: number };

const members = (ctx: Context, roomId: string) =>
  (
    ctx.sqlite
      .prepare('SELECT memberId FROM room_members WHERE roomId=? ORDER BY memberId')
      .all(roomId) as { memberId: string }[]
  ).map((m) => m.memberId);

/** Every member must belong to this project: an agent here, or a human identity granted this project. */
function assertMembers(ctx: Context, projectId: string, ids: readonly string[]) {
  if (new Set(ids).size !== ids.length) throw new DomainError('DUPLICATE_MEMBER', 400);
  for (const id of ids) {
    if (ctx.sqlite.prepare('SELECT 1 FROM agents WHERE id=? AND projectId=?').get(id, projectId))
      continue;
    const human = ctx.sqlite
      .prepare(
        "SELECT role,projectIds FROM identities WHERE id=? AND revokedAt IS NULL AND role IN ('owner','operator','reviewer','viewer')",
      )
      .get(id) as { role: string; projectIds: string } | undefined;
    const granted = human ? (JSON.parse(human.projectIds) as string[]) : [];
    if (!human || !(granted.includes('*') || granted.includes(projectId)))
      throw new DomainError('MEMBER_NOT_IN_PROJECT', 404);
  }
}

const view = (ctx: Context, row: Row): Room => ({
  id: row.id,
  name: row.name,
  members: members(ctx, row.id),
  createdAt: row.createdAt,
});

export function listRooms(ctx: Context, projectId: string): Room[] {
  return (
    ctx.sqlite
      .prepare('SELECT id,name,createdAt FROM rooms WHERE projectId=? ORDER BY createdAt,id')
      .all(projectId) as Row[]
  ).map((r) => view(ctx, r));
}

export function roomCommand(
  ctx: Context,
  actor: Actor,
  c: Extract<Command, { type: 'room.create' | 'room.members' }>,
) {
  assertMembers(ctx, c.projectId, c.data.members);
  if (c.type === 'room.create') {
    const id = randomUUID();
    try {
      ctx.sqlite
        .prepare('INSERT INTO rooms(id,projectId,name,createdBy,createdAt) VALUES (?,?,?,?,?)')
        .run(id, c.projectId, c.data.name, actor.id, ctx.now());
    } catch (error) {
      if ((error as { code?: string }).code === 'SQLITE_CONSTRAINT_UNIQUE')
        throw new DomainError('ROOM_NAME_TAKEN', 409);
      throw error;
    }
    for (const m of c.data.members)
      ctx.sqlite.prepare('INSERT INTO room_members VALUES (?,?)').run(id, m);
    return view(
      ctx,
      ctx.sqlite.prepare('SELECT id,name,createdAt FROM rooms WHERE id=?').get(id) as Row,
    );
  }
  const row = ctx.sqlite
    .prepare('SELECT id,name,createdAt FROM rooms WHERE id=? AND projectId=?')
    .get(c.data.roomId, c.projectId) as Row | undefined;
  if (!row) throw new DomainError('ROOM_NOT_FOUND', 404);
  ctx.sqlite.prepare('DELETE FROM room_members WHERE roomId=?').run(row.id);
  for (const m of c.data.members)
    ctx.sqlite.prepare('INSERT INTO room_members VALUES (?,?)').run(row.id, m);
  return view(ctx, row);
}

/** Recipients of a room post, or an error if the sender may not post. Humans with write access may always post. */
export function roomRecipients(
  ctx: Context,
  projectId: string,
  roomId: string,
  actor: Actor,
): string[] {
  const room = ctx.sqlite
    .prepare('SELECT id FROM rooms WHERE id=? AND projectId=?')
    .get(roomId, projectId);
  if (!room) throw new DomainError('ROOM_NOT_FOUND', 404);
  const all = members(ctx, roomId);
  const sender = actor.agentId ?? actor.id;
  const privileged = !actor.agentId && ['owner', 'operator'].includes(actor.role);
  if (!privileged && !all.includes(sender)) throw new DomainError('ROOM_FORBIDDEN', 403);
  const others = all.filter((m) => m !== sender);
  if (!others.length) throw new DomainError('ROOM_HAS_NO_OTHER_MEMBERS', 409);
  return others;
}
