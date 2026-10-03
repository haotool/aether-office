import { StdioServerTransport } from '@modelcontextprotocol/sdk/server/stdio.js';
import { createCollaborationMcp } from './mcp.js';
const server = createCollaborationMcp({
  url: process.env['AETHER_MCP_URL'],
  token: process.env['AETHER_MCP_TOKEN'],
  projectId: process.env['AETHER_MCP_PROJECT'],
  agentId: process.env['AETHER_MCP_AGENT'],
  workId: process.env['AETHER_MCP_WORK'],
  runId: process.env['AETHER_MCP_RUN'],
});
await server.connect(new StdioServerTransport());
