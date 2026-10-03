import { randomUUID } from 'node:crypto';
import type { Command, FileReservation } from '@aether/contracts';
import { DomainError, findConflicts, normalizePattern, type Actor } from '@aether/kernel';
import type { Context } from './context.js';

const MAX_ACTIVE_PER_OWNER = 16;

type Row = {
  id: string;
  ownerId: string;
  workId: string | null;
  patterns: string;
  fence: number;
  state: 'active' | 'released';
  expiresAt: number;
};

const view = (row: Row, now: number): FileReservation => ({
  id: row.id,
  ownerId: row.ownerId,
  workId: row.workId,
  patterns: JSON.parse(row.patterns) as string[],
  fence: row.fence,
  state: row.state === 'released' ? 'released' : row.expiresAt <= now ? 'expired' : 'active',
  expiresAt: row.expiresAt,
  // Coordination only: nothing here stops another process from writing a file.
  advisory: true,
});

export function listReservations(ctx: Context, projectId: string): FileReservation[] {
  const now = ctx.now();
  return (
    ctx.sqlite
      .prepare(
        "SELECT * FROM file_reservations WHERE projectId=? AND state='active' AND expiresAt>? ORDER BY fence",
      )
      .all(projectId, now) as Row[]
  ).map((row) => view(row, now));
}

function owned(ctx: Context, actor: Actor, projectId: string, id: string): Row {
  const row = ctx.sqlite
    .prepare('SELECT * FROM file_reservations WHERE id=? AND projectId=?')
    .get(id, projectId) as Row | undefined;
  if (!row) throw new DomainError('RESERVATION_NOT_FOUND', 404);
  // Agents manage only their own; a human owner/operator may override a stuck one.
  if (row.ownerId !== actor.id && actor.role !== 'owner' && actor.role !== 'operator')
    throw new DomainError('RESERVATION_FORBIDDEN', 403);
  return row;
}

export function reservationCommand(
  ctx: Context,
  actor: Actor,
  c: Extract<Command, { type: `reservation.${string}` }>,
): Record<string, unknown> {
  const now = ctx.now();
  if (c.type === 'reservation.acquire') {
    const patterns = c.data.patterns.map((p) => {
      const normalized = normalizePattern(p);
      if (!normalized) throw new DomainError('RESERVATION_PATTERN_INVALID', 400);
      return normalized;
    });
    if (
      c.data.workId &&
      !ctx.sqlite
        .prepare('SELECT 1 FROM work_items WHERE id=? AND projectId=?')
        .get(c.data.workId, c.projectId)
    )
      throw new DomainError('WORK_NOT_FOUND', 404);
    const held = listReservations(ctx, c.projectId);
    if (held.filter((r) => r.ownerId === actor.id).length >= MAX_ACTIVE_PER_OWNER)
      throw new DomainError('RESERVATION_LIMIT', 429);
    const conflicts = findConflicts(patterns, actor.id, held, now);
    if (conflicts.length) return { granted: false, advisory: true, conflicts };
    const fence =
      (
        ctx.sqlite
          .prepare(
            'SELECT COALESCE(MAX(fence),0) AS fence FROM file_reservations WHERE projectId=?',
          )
          .get(c.projectId) as { fence: number }
      ).fence + 1;
    const row: Row = {
      id: randomUUID(),
      ownerId: actor.id,
      workId: c.data.workId ?? null,
      patterns: JSON.stringify(patterns),
      fence,
      state: 'active',
      expiresAt: now + c.data.ttlSec * 1000,
    };
    ctx.sqlite
      .prepare(
        'INSERT INTO file_reservations(id,projectId,ownerId,workId,patterns,fence,state,expiresAt,createdAt) VALUES (?,?,?,?,?,?,?,?,?)',
      )
      .run(
        row.id,
        c.projectId,
        row.ownerId,
        row.workId,
        row.patterns,
        fence,
        'active',
        row.expiresAt,
        now,
      );
    return { granted: true, reservation: view(row, now) };
  }
  const row = owned(ctx, actor, c.projectId, c.data.reservationId);
  if (c.type === 'reservation.renew') {
    // An expired lease may have been taken over; renewing it would silently bypass the conflict check.
    if (row.state !== 'active' || row.expiresAt <= now)
      throw new DomainError('RESERVATION_EXPIRED', 409);
    const expiresAt = now + c.data.ttlSec * 1000;
    ctx.sqlite
      .prepare('UPDATE file_reservations SET expiresAt=? WHERE id=?')
      .run(expiresAt, row.id);
    return { reservation: view({ ...row, expiresAt }, now) };
  }
  ctx.sqlite
    .prepare("UPDATE file_reservations SET state='released',releasedAt=? WHERE id=?")
    .run(now, row.id);
  return { reservation: view({ ...row, state: 'released' }, now) };
}
