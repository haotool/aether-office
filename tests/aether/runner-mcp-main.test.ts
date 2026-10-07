import { afterEach, describe, expect, it, vi } from 'vitest';

// mcp-main.ts is the entry the CLIs spawn: it builds the collaboration server from AETHER_MCP_* variables and serves it on
// stdio. The server (covered by mcp.test.ts) and the transport (it would take over this process's stdin) are replaced.
const created: Record<string, unknown>[] = [];
const connected: unknown[] = [];
vi.mock('../../apps/runner/src/mcp.js', () => ({
  createCollaborationMcp: (options: Record<string, unknown>) => {
    created.push(options);
    return { connect: (transport: unknown) => (connected.push(transport), Promise.resolve()) };
  },
}));
vi.mock('@modelcontextprotocol/sdk/server/stdio.js', () => ({
  StdioServerTransport: class {
    readonly kind = 'stdio';
  },
}));

afterEach(() => {
  vi.unstubAllEnvs();
  created.length = 0;
  connected.length = 0;
  vi.resetModules();
});

describe('runner mcp-main', () => {
  it('hands the server the project, agent and run named in the environment', async () => {
    vi.stubEnv('AETHER_MCP_URL', 'http://127.0.0.1:4310');
    vi.stubEnv('AETHER_MCP_TOKEN', 'tok');
    vi.stubEnv('AETHER_MCP_PROJECT', 'p1');
    vi.stubEnv('AETHER_MCP_AGENT', 'a1');
    vi.stubEnv('AETHER_MCP_WORK', 'w1');
    vi.stubEnv('AETHER_MCP_RUN', 'r1');
    await import('../../apps/runner/src/mcp-main.js');
    expect(created).toEqual([
      {
        url: 'http://127.0.0.1:4310',
        token: 'tok',
        projectId: 'p1',
        agentId: 'a1',
        workId: 'w1',
        runId: 'r1',
      },
    ]);
  });

  it('serves it on stdio', async () => {
    await import('../../apps/runner/src/mcp-main.js');
    expect(connected).toHaveLength(1);
    expect(connected[0]).toMatchObject({ kind: 'stdio' });
  });

  it('leaves what the environment does not say undefined, for the server to refuse', async () => {
    for (const name of ['URL', 'TOKEN', 'PROJECT', 'AGENT', 'WORK', 'RUN'])
      vi.stubEnv(`AETHER_MCP_${name}`, undefined);
    await import('../../apps/runner/src/mcp-main.js');
    expect(Object.values(created[0]!).every((value) => value === undefined)).toBe(true);
  });
});
