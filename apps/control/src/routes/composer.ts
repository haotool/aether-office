import { homedir } from 'node:os';
import { DomainError } from '@aether/kernel';
import { z } from 'zod';
import { processOf, scanLocalSessions } from '../services/local-sessions.js';
import { listCustomCommands } from '../services/session-commands.js';
import { listSessionFiles, MAX_QUERY_CHARS } from '../services/session-files.js';
import { terminalOfSession } from '../services/terminal-link.js';
import { requireOperator, type RouteContext } from './context.js';

const SESSION_KEY = /^(claude|codex):[A-Za-z0-9._-]{1,200}$/;
const filesQuery = z.object({ q: z.string().max(MAX_QUERY_CHARS).default('') }).strict();

/** What the session panel's composer needs to know about a local session: its terminal, commands and files. */
export function composerRoutes({ app, control, actor }: RouteContext) {
  const home = () => process.env['AETHER_LOCAL_SESSIONS_HOME'] ?? homedir();
  // The session as the latest scan found it. The key picks it; its directory and process are never taken from the browser.
  async function session(request: { params: { key: string } }) {
    requireOperator(actor(request as never));
    if (!SESSION_KEY.test(request.params.key)) throw new DomainError('INVALID_SESSION_KEY', 400);
    if (process.env['AETHER_LOCAL_SESSIONS'] === 'off')
      throw new DomainError('LOCAL_SESSIONS_OFF', 404);
    const found = (await scanLocalSessions(home())).find((s) => s.key === request.params.key);
    if (!found) throw new DomainError('SESSION_NOT_FOUND', 404);
    return found;
  }
  // The AETHER terminal this session runs in, when it was started there: the only kind AETHER can type into.
  app.get<{ Params: { key: string } }>('/api/local-sessions/:key/terminal', async (request) => {
    const found = await session(request);
    const projects = control.listProjects(actor(request)).map((p) => p.id);
    return {
      terminal: await terminalOfSession(control.ctx, processOf(found.key), projects),
    };
  });
  // Custom commands and skills (names and descriptions) from the session's directory and the user's Claude folder.
  app.get<{ Params: { key: string } }>('/api/local-sessions/:key/commands', async (request) => {
    const found = await session(request);
    return { commands: await listCustomCommands(found.provider, found.cwd, home()) };
  });
  // `@` completion: file paths Git knows in the session's directory, ignored files left out, a few at a time.
  app.get<{ Params: { key: string }; Querystring: unknown }>(
    '/api/local-sessions/:key/files',
    async (request) => {
      const found = await session(request);
      const { q } = filesQuery.parse(request.query);
      return { files: await listSessionFiles(found.cwd, q) };
    },
  );
}
