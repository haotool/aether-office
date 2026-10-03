import { expect, it } from 'vitest';
import { command, fixture } from './fixture.js';
import { createServer } from '../../apps/control/src/server.js';

const acquire = (patterns: string[], ttlSec = 60) => ({ patterns, ttlSec });

it('grants disjoint leases, reports conflicts, enforces ownership, and lets expired leases be taken over', async () => {
  let now = 1_000_000;
  const f = fixture(':memory:', () => now);
  const run = (who: typeof f.sender.actor, type: string, data: unknown) =>
    f.control.execute(who, command(type, data, f.projectId));
  try {
    const first = run(f.sender.actor, 'reservation.acquire', acquire(['src/**'])).result as {
      granted: boolean;
      reservation: { id: string; fence: number; advisory: boolean };
    };
    expect(first).toMatchObject({ granted: true, reservation: { fence: 1, advisory: true } });

    const clash = run(f.recipient.actor, 'reservation.acquire', acquire(['src/a.ts'])).result;
    expect(clash).toMatchObject({ granted: false, conflicts: [{ pattern: 'src/**' }] });
    expect(
      run(f.recipient.actor, 'reservation.acquire', acquire(['docs/**'])).result,
    ).toMatchObject({
      granted: true,
      reservation: { fence: 2 },
    });

    expect(() =>
      run(f.recipient.actor, 'reservation.release', { reservationId: first.reservation.id }),
    ).toThrow('RESERVATION_FORBIDDEN');
    expect(() => run(f.sender.actor, 'reservation.acquire', acquire(['../etc']))).toThrow(
      'RESERVATION_PATTERN_INVALID',
    );

    now += 61_000; // lease lapses
    expect(() =>
      run(f.sender.actor, 'reservation.renew', { reservationId: first.reservation.id }),
    ).toThrow('RESERVATION_EXPIRED');
    expect(
      run(f.recipient.actor, 'reservation.acquire', acquire(['src/a.ts'])).result,
    ).toMatchObject({
      granted: true,
      reservation: { fence: 3 },
    });

    const app = createServer(f.control, { origin: 'http://127.0.0.1:4489' });
    try {
      const token = f.owner.token;
      const response = await app.inject({
        method: 'GET',
        url: `/api/projects/${f.projectId}/reservations`,
        headers: { authorization: `Bearer ${token}`, host: '127.0.0.1:4489' },
      });
      expect(response.statusCode).toBe(200);
      expect(response.json().reservations.map((r: { fence: number }) => r.fence)).toEqual([3]);
    } finally {
      await app.close();
    }

    // Human owner can release someone else's stuck lease.
    const [held] = (
      f.control.ctx.sqlite
        .prepare("SELECT id FROM file_reservations WHERE state='active' AND expiresAt>?")
        .all(now) as { id: string }[]
    ).slice(-1);
    expect(
      f.control.execute(
        f.owner.actor,
        command('reservation.release', { reservationId: held!.id }, f.projectId),
      ).result,
    ).toMatchObject({ reservation: { state: 'released' } });
  } finally {
    f.control.close();
  }
});
