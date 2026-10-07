import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { expect, it } from 'vitest';

// The usage readers look at files that already sit on this machine and nothing else: no network, no process of their own
// (git is reached only through git-health.ts, which has fixed read-only commands), no model SDK. The same patterns as the
// classifier's guard, plus dynamic `import()`, which a `from '…'` check cannot see.
const FORBIDDEN =
  /from ['"](?:node:)?(?:child_process|http|https|http2|net|tls|dgram|dns|worker_threads)['"]|from ['"](?:@anthropic-ai|@openai|openai|@google|@aether\/providers|undici|node-fetch|axios|ws)[^'"]*['"]|\bimport\(|\brequire\(|(?<![.\w])(?:fetch|spawn|execFile|exec)\(|\bXMLHttpRequest\b|\bWebSocket\b|claude -p|codex exec/;

const MODULES = [
  'usage-aggregate',
  'usage-files',
  'usage-claude',
  'usage-codex',
  'usage-counters',
  'usage-parse',
  'usage-stats',
  'usage-store',
  'session-usage',
  'session-context',
  'claude-limits',
  'codex-limits',
  'subagent-usage',
  'git-kpi',
].map((name) => resolve(__dirname, '../../apps/control/src/services', `${name}.ts`));

it('usage modules import no network, process or SDK', () => {
  for (const file of MODULES) {
    const source = readFileSync(file, 'utf8').replace(/\/\/.*$/gm, '');
    expect(FORBIDDEN.test(source), `${file} must not reach the network, a process or an SDK`).toBe(
      false,
    );
  }
});

it('the guard itself catches what it is for', () => {
  for (const bad of [
    "import { request } from 'node:https';",
    "const m = await import('node:child_process');",
    "import OpenAI from 'openai';",
    'await fetch(url);',
  ])
    expect(FORBIDDEN.test(bad), bad).toBe(true);
});
