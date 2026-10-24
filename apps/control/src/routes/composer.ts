import { homedir } from 'node:os';
import { DomainError } from '@aether/kernel';
import { z } from 'zod';
import { processOf, scanLocalSessions } from '../services/runtime/local-sessions.js';
import { listCustomCommands } from '../services/sessions/session-commands.js';
import { listSessionFiles, MAX_QUERY_CHARS } from '../services/sessions/session-files.js';
import { terminalOfNamedSession, terminalOfSession } from '../services/terminals/terminal-link.js';
import { requireOperator, type RouteContext } from './context.js';

const SESSION_KEY = /^(claude|codex):[A-Za-z0-9._-]{1,200}$/;
const filesQuery = z.strictObject({ q: z.string().max(MAX_QUERY_CHARS).default('') });

export function composerRoutes({ app, control, actor }: RouteContext) {
  const home = () => process.env['AETHER_LOCAL_SESSIONS_HOME'] ?? homedir();
  // The session as the latest scan found it. The key picks it; its directory and process are never taken from the browser.
  async function session(request: { params: { key: string } }) {
    const key = operatorKey(request);
    const found = (await scanLocalSessions(home())).find((s) => s.key === key);
    if (!found) throw new DomainError('SESSION_NOT_FOUND', 404);
    return found;
  }
  function operatorKey(request: { params: { key: string } }) {
    requireOperator(actor(request as never));
    if (!SESSION_KEY.test(request.params.key)) throw new DomainError('INVALID_SESSION_KEY', 400);
    if (process.env['AETHER_LOCAL_SESSIONS'] === 'off')
      throw new DomainError('LOCAL_SESSIONS_OFF', 404);
    return request.params.key;
  }
  app.get<{ Params: { key: string } }>('/api/local-sessions/:key/terminal', async (request) => {
    const key = operatorKey(request);
    const projects = control.listProjects(actor(request)).map((p) => p.id);
    const named = await terminalOfNamedSession(control.ctx, home(), key, projects);
    if (named) return { terminal: named };
    const found = await session(request);
    return {
      terminal: await terminalOfSession(control.ctx, processOf(found.key), projects),
    };
  });
  app.get<{ Params: { key: string } }>('/api/local-sessions/:key/commands', async (request) => {
    const found = await session(request);
    return { commands: await listCustomCommands(found.provider, found.cwd, home()) };
  });
  app.get<{ Params: { key: string }; Querystring: unknown }>(
    '/api/local-sessions/:key/files',
    async (request) => {
      const found = await session(request);
      const { q } = filesQuery.parse(request.query);
      return { files: await listSessionFiles(found.cwd, q) };
    },
  );
}
