import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { z } from 'zod';
import { APP_VERSION } from '@aether/contracts';
import { registerCollaborationTools, type ControlClient } from './mcp-tools.js';
const mcpScopeSchema = z.strictObject({
  url: z.url(),
  token: z.string().min(32),
  projectId: z.string().uuid(),
  agentId: z.string().uuid(),
  workId: z.string().uuid(),
  runId: z.string().uuid(),
});
export type McpScope = z.infer<typeof mcpScopeSchema>;
function controlClient(scope: McpScope, url: URL): ControlClient {
  async function api<T>(path: string, body?: unknown, signal?: AbortSignal): Promise<T> {
    const response = await fetch(new URL(path, url), {
      method: body === undefined ? 'GET' : 'POST',
      headers: { authorization: `Bearer ${scope.token}`, 'content-type': 'application/json' },
      ...(body === undefined ? {} : { body: JSON.stringify(body) }),
      redirect: 'error',
      signal: signal
        ? AbortSignal.any([signal, AbortSignal.timeout(5000)])
        : AbortSignal.timeout(5000),
    });
    if (!response.ok) throw new Error(`CONTROL_HTTP_${response.status}`);
    return response.json() as Promise<T>;
  }
  const command = (type: string, data: unknown, idempotencyKey: string, expectedVersion?: number) =>
    api('/api/commands', {
      schemaVersion: 1,
      type,
      data,
      projectId: scope.projectId,
      idempotencyKey,
      correlationId: scope.runId,
      ...(expectedVersion === undefined ? {} : { expectedVersion }),
    });
  const result = (value: unknown) => ({
    content: [{ type: 'text' as const, text: JSON.stringify(value) }],
  });
  const perform = async (fn: () => Promise<unknown>) => {
    try {
      return result(await fn());
    } catch (e) {
      return {
        isError: true,
        ...result({
          error:
            e instanceof Error && /^CONTROL_HTTP_\d+$/.test(e.message)
              ? e.message
              : 'COLLABORATION_UNAVAILABLE',
        }),
      };
    }
  };
  return { scope, projectPath: `/api/projects/${scope.projectId}`, api, command, perform };
}

export function createCollaborationMcp(input: unknown) {
  const scope = mcpScopeSchema.parse(input);
  const url = new URL(scope.url);
  if (
    url.protocol !== 'https:' &&
    !(url.protocol === 'http:' && ['localhost', '127.0.0.1', '[::1]'].includes(url.hostname))
  )
    throw new Error('TLS_REQUIRED');
  const server = new McpServer({ name: 'aether-collaboration', version: APP_VERSION });
  const client = controlClient(scope, url);
  registerCollaborationTools(server, client);
  server.registerResource(
    'session',
    `aether://session/${scope.runId}`,
    { mimeType: 'application/json', description: 'Authenticated scope for this managed run.' },
    async (uri) => {
      await client.api('/api/session');
      return {
        contents: [
          {
            uri: uri.href,
            mimeType: 'application/json',
            text: JSON.stringify({
              projectId: scope.projectId,
              agentId: scope.agentId,
              workId: scope.workId,
              runId: scope.runId,
            }),
          },
        ],
      };
    },
  );
  return server;
}
