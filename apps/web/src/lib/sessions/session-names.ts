import { shortLabel } from '@aether/kernel';
import type { AttributedSession, LocalSession } from '@aether/contracts';
import { SUBAGENT_INFIX } from '../../lib/sessions/subagent-id.js';

export const LOCAL_PREFIX = 'local:';

const basename = (path: string) => path.split('/').filter(Boolean).pop() ?? '';
const place = (s: Pick<LocalSession, 'cwd' | 'repo'>) => {
  const dir = basename(s.cwd) || s.repo;
  return dir.startsWith(`${s.repo}-`) ? dir.slice(s.repo.length + 1) : dir;
};
export const tagOf = (s: Pick<LocalSession, 'provider' | 'sessionId'>) =>
  `${s.provider === 'codex' ? 'cx' : 'cl'}·${s.sessionId.slice(0, 4)}`;
export const NAME_WIDTH = 28;
export const labelOf = (s: Pick<LocalSession, 'cwd' | 'repo' | 'title'>) =>
  shortLabel(s.title ?? place(s), { maxWidth: NAME_WIDTH, repo: s.repo });
const ROW_WIDTH = 44;
export const rowLabelOf = (s: Pick<LocalSession, 'title' | 'repo'>) =>
  shortLabel(s.title ?? s.repo, { maxWidth: ROW_WIDTH });

export const sessionIdOf = (agentId: string): string | null =>
  agentId.startsWith(LOCAL_PREFIX)
    ? (agentId.slice(LOCAL_PREFIX.length).split(SUBAGENT_INFIX)[0] ?? null)
    : null;

export const sessionLink = (s: Pick<AttributedSession, 'key' | 'projectId'>) =>
  `/office?${s.projectId ? `project=${s.projectId}&` : ''}agent=${encodeURIComponent(`${LOCAL_PREFIX}${s.key}`)}&focus=1`;
