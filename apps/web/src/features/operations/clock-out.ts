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

export const IDLE_DAYS = [1, 3, 7] as const;
export type IdleDays = (typeof IDLE_DAYS)[number];
export const idleMs = (days: IdleDays) => days * DAY_MS;

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
    .sort((a, b) => (b.liveness.quietMs ?? 0) - (a.liveness.quietMs ?? 0))
    .slice(0, CLOCK_OUT_MAX_SESSIONS);
}

export function memoryOf(sessions: readonly AttributedSession[]): { bytes: number; known: number } {
  const measured = sessions.flatMap((s) => (s.resources ? [s.resources.rssBytes] : []));
  return { bytes: measured.reduce((a, b) => a + b, 0), known: measured.length };
}

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
  leaving: Record<string, number>;
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
