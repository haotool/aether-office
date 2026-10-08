import { shortLabel } from '@aether/kernel';
import type { AttributedSession, LocalSession } from '@aether/contracts';
import { SUBAGENT_INFIX } from '../../lib/sessions/subagent-id.js';

export const LOCAL_PREFIX = 'local:';

const basename = (path: string) => path.split('/').filter(Boolean).pop() ?? '';
// An untitled session in a worktree named after its repository is named by what sets the worktree apart
// (`accounting-bunny-w1119` → `w1119`); the repository is the project it is shown in.
const place = (s: Pick<LocalSession, 'cwd' | 'repo'>) => {
  const dir = basename(s.cwd) || s.repo;
  return dir.startsWith(`${s.repo}-`) ? dir.slice(s.repo.length + 1) : dir;
};
/** The technical id of a session (`cx·01a1`): only ever shown in a tooltip, never as its name. */
export const tagOf = (s: Pick<LocalSession, 'provider' | 'sessionId'>) =>
  `${s.provider === 'codex' ? 'cx' : 'cl'}·${s.sessionId.slice(0, 4)}`;
/** Widest name, in columns (CJK counts two): what a name tag has room for. */
export const NAME_WIDTH = 28;
/** The short display label of a session: its title on a meaning boundary, brackets balanced, no id prefix. */
export const labelOf = (s: Pick<LocalSession, 'cwd' | 'repo' | 'title'>) =>
  shortLabel(s.title ?? place(s), { maxWidth: NAME_WIDTH, repo: s.repo });
/** Widest title in a list row, in columns; the row's own ellipsis is only a backstop, the cut is made on a boundary. */
const ROW_WIDTH = 44;
export const rowLabelOf = (s: Pick<LocalSession, 'title' | 'repo'>) =>
  shortLabel(s.title ?? s.repo, { maxWidth: ROW_WIDTH });

export const sessionIdOf = (agentId: string): string | null =>
  agentId.startsWith(LOCAL_PREFIX)
    ? (agentId.slice(LOCAL_PREFIX.length).split(SUBAGENT_INFIX)[0] ?? null)
    : null;

/** The address that shows a session in the office, focused: what a tap on its alert or its row opens. */
export const sessionLink = (s: Pick<AttributedSession, 'key' | 'projectId'>) =>
  `/office?${s.projectId ? `project=${s.projectId}&` : ''}agent=${encodeURIComponent(`${LOCAL_PREFIX}${s.key}`)}&focus=1`;
