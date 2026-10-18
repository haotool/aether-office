import { spawnSync } from 'node:child_process';
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
import { createRequire } from 'node:module';
const { query } = await import(
  createRequire(resolve('packages/providers/package.json')).resolve(
    '@anthropic-ai/claude-agent-sdk',
  )
);
import { expect, it } from 'vitest';
import { assertClaudeVersion } from '../../packages/providers/src/compat.js';

const cli = spawnSync('claude', ['--version'], { encoding: 'utf8' });
it.skipIf(cli.status !== 0)(
  'initializes the installed Claude CLI through the SDK without sending a model prompt',
  async () => {
    assertClaudeVersion(cli.stdout);
    const root = mkdtempSync(join(tmpdir(), 'aether-claude-compat-'));
    const abortController = new AbortController();
    const timer = setTimeout(() => abortController.abort(), 10000);
    let finish!: () => void;
    const wait = new Promise<void>((resolve) => {
      finish = resolve;
    });
    const running = query({
      prompt: (async function* () {
        await wait;
      })(),
      options: {
        cwd: root,
        pathToClaudeCodeExecutable: 'claude',
        abortController,
        settingSources: [],
        persistSession: false,
        tools: [],
        env: {
          ...process.env,
          CLAUDE_CONFIG_DIR: root,
          CLAUDE_CODE_DISABLE_NONESSENTIAL_TRAFFIC: '1',
        },
      },
    });
    try {
      expect(Array.isArray(await running.supportedCommands())).toBe(true);
    } finally {
      clearTimeout(timer);
      finish();
      running.close();
      rmSync(root, { recursive: true, force: true });
    }
  },
  15000,
);
