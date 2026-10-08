import { create } from 'zustand';
import {
  CLOCK_OUT_MAX_SESSIONS,
  type AttributedSession,
  type ClockOutResponse,
} from '@aether/contracts';
import { DAY_MS } from '@aether/kernel';
import { STAGGER_MS } from '@aether/office-scene/model';
import { api } from '../../lib/api/api.js';
import { uuid } from '../../lib/platform/browser-compat.js';
import { LOCAL_PREFIX } from '../../lib/sessions/session-names.js';

/** How long a session must have been idle to be offered for clocking out. */
export const IDLE_DAYS = [1, 3, 7] as const;
export type IdleDays = (typeof IDLE_DAYS)[number];
export const idleMs = (days: IdleDays) => days * DAY_MS;

/**
 * The sessions that may be sent home: a process is running, nothing has happened in it for `days` days, and it is one
 * the server would stop by hand (forgotten, or left without an owner). The longest idle first, and at most what one
 * request may carry. The server checks every one of these again.
 */
export function idleSessions(
  sessions: readonly AttributedSession[],
  days: IdleDays,
): AttributedSession[] {
  return sessions
    .filter(
      (s) =>
        s.process === 'running' &&
        ['dormant', 'orphaned'].includes(s.liveness.state) &&
        s.liveness.startedAt !== null &&
        (s.liveness.quietMs ?? 0) >= idleMs(days),
    )
    .sort((a, b) => b.liveness.quietMs! - a.liveness.quietMs!)
    .slice(0, CLOCK_OUT_MAX_SESSIONS);
}

/** Resident memory the sessions hold, from the process scan, and how many of them it is known for. Never a guess. */
export function memoryOf(sessions: readonly AttributedSession[]): { bytes: number; known: number } {
  const measured = sessions.flatMap((s) => (s.resources ? [s.resources.rssBytes] : []));
  return { bytes: measured.reduce((a, b) => a + b, 0), known: measured.length };
}

/** "480 MB", "1.3 GB". */
export const formatMemory = (bytes: number) =>
  bytes >= 1e9 ? `${(bytes / 1e9).toFixed(1)} GB` : `${Math.max(1, Math.round(bytes / 1e6))} MB`;

/** Asks the server to send the sessions home. Each carries the process start the person saw, never a pid. */
export const clockOut = (sessions: readonly AttributedSession[], days: IdleDays) =>
  api<ClockOutResponse>('/api/local-sessions/clock-out', {
    method: 'POST',
    headers: { 'idempotency-key': uuid() },
    body: JSON.stringify({
      minIdleMs: idleMs(days),
      sessions: sessions.map((s) => ({ key: s.key, startedAt: s.liveness.startedAt })),
    }),
  });

/**
 * Those of `leaving` that are still gone: a session that has been resumed since (a process that began after the member
 * started to leave) is back at its desk.
 */
export function stillGone(
  leaving: Readonly<Record<string, number>>,
  sessions: readonly AttributedSession[],
): Record<string, number> {
  const resumed = new Set(
    sessions
      .filter(
        (s) =>
          s.process === 'running' &&
          (s.liveness.startedAt ?? 0) > (leaving[`${LOCAL_PREFIX}${s.key}`] ?? Infinity),
      )
      .map((s) => `${LOCAL_PREFIX}${s.key}`),
  );
  return Object.fromEntries(Object.entries(leaving).filter(([id]) => !resumed.has(id)));
}

type Leaving = {
  /** Office member id → the wall-clock moment it begins to leave. Stays, so a member is not drawn at its desk again. */
  leaving: Record<string, number>;
  /** Members begin to leave one after another, a few hundred milliseconds apart. */
  send: (keys: readonly string[], now?: number) => void;
};
export const useLeaving = create<Leaving>()((set) => ({
  leaving: {},
  send: (keys, now = Date.now()) =>
    set((state) => ({
      leaving: {
        ...state.leaving,
        ...Object.fromEntries(
          keys.map((key, i) => [`${LOCAL_PREFIX}${key}`, now + i * STAGGER_MS] as const),
        ),
      },
    })),
}));
