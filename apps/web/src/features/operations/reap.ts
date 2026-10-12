import type { LocalSession } from '@aether/contracts';
import { api } from '../../lib/api/api.js';

type Reaped = { nudged: number; before: number; after: number };

export const reapZombies = (session: Pick<LocalSession, 'key' | 'liveness'>) =>
  api<Reaped>(`/api/local-sessions/${encodeURIComponent(session.key)}/reap-zombies`, {
    method: 'POST',
    body: JSON.stringify({ startedAt: session.liveness.startedAt }),
  });
