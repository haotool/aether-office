import type { LocalSession } from '@aether/contracts';
import { api } from '../api.js';

export type Reaped = { nudged: number; before: number; after: number };

/** Reminds the parents of a session's zombies to collect them (the server checks it is still the process you saw). */
export const reapZombies = (session: Pick<LocalSession, 'key' | 'liveness'>) =>
  api<Reaped>(`/api/local-sessions/${encodeURIComponent(session.key)}/reap-zombies`, {
    method: 'POST',
    body: JSON.stringify({ startedAt: session.liveness.startedAt }),
  });
