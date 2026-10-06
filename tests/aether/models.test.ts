import { chmodSync, copyFileSync, mkdirSync, mkdtempSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import {
  STALE_MS,
  detectModels,
  parseClaudeCatalog,
  parseCodexModels,
} from '../../packages/providers/src/models.js';
import { fixture } from './fixture.js';

const FIXTURES = join(import.meta.dirname, 'fixtures', 'models');
const FRESH = Date.parse('2026-10-06T05:00:00Z'); // an hour after both fixture caches were fetched
const HOUR = 3_600_000;

type Home = { env: NodeJS.ProcessEnv; claudeDir: string; codexDir: string; bin: string };
/** An empty machine: no caches, and a PATH holding only a directory of our own. */
function emptyHome(): Home {
  const root = mkdtempSync(join(tmpdir(), 'aether-models-'));
  const claudeDir = join(root, 'claude');
  const codexDir = join(root, 'codex');
  const bin = join(root, 'bin');
  for (const dir of [join(claudeDir, 'cache', 'model-catalog'), codexDir, bin])
    mkdirSync(dir, { recursive: true });
  return {
    env: { AETHER_CLAUDE_HOME: claudeDir, AETHER_CODEX_HOME: codexDir, PATH: bin },
    claudeDir,
    codexDir,
    bin,
  };
}
function withCaches(): Home {
  const home = emptyHome();
  copyFileSync(
    join(FIXTURES, 'claude-cc.json'),
    join(home.claudeDir, 'cache', 'model-catalog', 'abc-cc.json'),
  );
  copyFileSync(join(FIXTURES, 'claude.json'), join(home.claudeDir, '.claude.json'));
  copyFileSync(join(FIXTURES, 'codex-models.json'), join(home.codexDir, 'models_cache.json'));
  return home;
}
const detect = async (home: Home, now = FRESH) => {
  const [claude, codex] = await detectModels(home.env, { refresh: true, now });
  return { claude: claude!, codex: codex! };
};
/** A stand-in `codex` on PATH that prints the fixture the way `codex debug models` does. */
function fakeCodex(home: Home, output = join(FIXTURES, 'codex-models.json')) {
  const file = join(home.bin, 'codex');
  writeFileSync(file, `#!/bin/sh\n/bin/cat '${output}'\n`);
  chmodSync(file, 0o755);
}

describe('Claude models', () => {
  it('lists the family aliases first, then the full IDs of the catalog in its own order', async () => {
    const { claude } = await detect(withCaches());
    expect(claude.source).toBe('cache');
    expect(claude.stale).toBe(false);
    expect(claude.fetchedAt).toBe(1791257877504);
    expect(claude.models.map((m) => m.id)).toEqual([
      'fable',
      'opus',
      'sonnet',
      'haiku',
      'claude-opus-5-5',
      'claude-fable-5-1',
      'claude-sonnet-5-5',
      'claude-haiku-4-5-20251001',
      'claude-fable-5-1[1m]',
    ]);
    const opus = claude.models.find((m) => m.id === 'claude-opus-5-5')!;
    expect(opus).toMatchObject({
      label: 'Opus 5.5',
      family: 'opus',
      isAlias: false,
      defaultEffort: 'medium',
      efforts: ['low', 'medium', 'high', 'xhigh', 'max'],
    });
    expect(claude.models.find((m) => m.id === 'opus')).toMatchObject({
      isAlias: true,
      efforts: opus.efforts,
    });
    expect(claude.models.find((m) => m.id === 'haiku')?.efforts).toEqual([]);
  });

  it('adds the 1M variants from .claude.json and keeps overflow (older) models out', async () => {
    const { claude } = await detect(withCaches());
    expect(claude.models.find((m) => m.id === 'claude-fable-5-1[1m]')).toMatchObject({
      label: 'Fable 5.1 1M',
      family: 'fable',
      contextWindow: 1_000_000,
    });
    expect(claude.models.map((m) => m.id)).not.toContain('claude-opus-4-8');
  });

  it('marks a catalog older than seven days stale but still lists it', async () => {
    const { claude } = await detect(withCaches(), 1791257877504 + STALE_MS + HOUR);
    expect(claude.stale).toBe(true);
    expect(claude.models.length).toBeGreaterThan(4);
  });

  it('falls back to the four aliases when there is no cache at all', async () => {
    const { claude } = await detect(emptyHome());
    expect(claude).toMatchObject({ source: 'fallback', stale: true });
    expect(claude.fetchedAt).toBeUndefined();
    expect(claude.models.map((m) => m.id)).toEqual(['fable', 'opus', 'sonnet', 'haiku']);
    expect(claude.models.every((m) => m.isAlias)).toBe(true);
  });

  it('survives malformed, truncated and unexpected files', async () => {
    const home = emptyHome();
    const dir = join(home.claudeDir, 'cache', 'model-catalog');
    writeFileSync(join(dir, 'a-cc.json'), '{"catalog": {"config": {"models": [');
    writeFileSync(
      join(dir, 'b-ccd.json'),
      JSON.stringify({ catalog: { config: { models: 'x' } } }),
    );
    writeFileSync(join(home.claudeDir, '.claude.json'), 'not json');
    expect((await detect(home)).claude.source).toBe('fallback');
    expect(parseClaudeCatalog('[]')).toEqual({ models: [] });
    expect(parseClaudeCatalog('null').models).toEqual([]);
  });

  it('skips unknown fields and entries without an id, keeping the usable ones', () => {
    const raw = JSON.stringify({
      fetchedAt: 'later',
      catalog: {
        config: {
          models: [
            { name: 'no id' },
            { id: 'claude-opus-9', section: 'main', surprise: { a: 1 }, thinking: 7 },
          ],
        },
      },
    });
    expect(parseClaudeCatalog(raw).models).toEqual([
      { id: 'claude-opus-9', label: 'claude-opus-9', family: 'opus', efforts: [], isAlias: false },
    ]);
  });
});

describe('Codex models', () => {
  it('keeps the listed models only, best priority first, with their efforts and context window', async () => {
    const { codex } = await detect(withCaches());
    expect(codex).toMatchObject({ source: 'cache', stale: false });
    expect(codex.models.map((m) => m.id)).toEqual([
      'gpt-6.1-sol',
      'gpt-6-astra',
      'gpt-6-sol',
      'gpt-5.6-sol',
    ]);
    expect(codex.models[0]).toMatchObject({
      label: 'GPT-6.1-Sol',
      isAlias: false,
      defaultEffort: 'low',
      contextWindow: 272000,
    });
    expect(codex.models[0]!.efforts).toEqual(['low', 'medium', 'high', 'xhigh', 'max', 'ultra']);
  });

  it('does not run the CLI while the cache is fresh', async () => {
    const home = withCaches();
    const other = join(home.bin, 'other.json');
    writeFileSync(other, JSON.stringify({ models: [{ slug: 'from-cli', visibility: 'list' }] }));
    fakeCodex(home, other);
    expect((await detect(home)).codex.models[0]!.id).toBe('gpt-6.1-sol');
  });

  it('asks `codex debug models` when the cache is older than a day, and says so', async () => {
    const home = withCaches();
    const other = join(home.bin, 'other.json');
    writeFileSync(
      other,
      JSON.stringify({
        models: [
          { slug: 'hidden', visibility: 'hide', priority: 1 },
          { slug: 'gpt-7', display_name: 'GPT-7', visibility: 'list', priority: 2 },
          { slug: 'gpt-7-mini', visibility: 'list', priority: 1 },
        ],
      }),
    );
    fakeCodex(home, other);
    const { codex } = await detect(home, FRESH + 30 * HOUR);
    expect(codex).toMatchObject({ source: 'cli', stale: false, fetchedAt: FRESH + 30 * HOUR });
    expect(codex.models.map((m) => m.id)).toEqual(['gpt-7-mini', 'gpt-7']);
  });

  it('probes the CLI when there is no cache file, and falls back to nothing when there is no CLI', async () => {
    const home = emptyHome();
    expect((await detect(home)).codex).toEqual({
      provider: 'codex',
      models: [],
      source: 'fallback',
      stale: true,
    });
    fakeCodex(home);
    expect((await detect(home)).codex.source).toBe('cli');
  });

  it('keeps an old cache, marked stale, when the CLI cannot answer', async () => {
    const home = withCaches();
    const file = join(home.bin, 'codex');
    writeFileSync(file, '#!/bin/sh\nexit 3\n');
    chmodSync(file, 0o755);
    const { codex } = await detect(home, FRESH + 8 * 24 * HOUR);
    expect(codex.source).toBe('cache');
    expect(codex.stale).toBe(true);
    expect(codex.models.length).toBe(4);
  });

  it('is tolerant of malformed output', () => {
    expect(parseCodexModels('{').models).toEqual([]);
    expect(
      parseCodexModels(
        '{"models":[1,null,{"visibility":"list"},{"slug":"x","visibility":"list","priority":"high"}]}',
      ).models.map((m) => m.id),
    ).toEqual(['x']);
  });
});

describe('memory', () => {
  it('serves repeated reads from memory until a source file changes, and refresh skips it', async () => {
    const home = withCaches();
    const first = await detectModels(home.env, { now: FRESH });
    const again = await detectModels(home.env, { now: FRESH + 2000 });
    expect(again[1]).toBe(first[1]);
    writeFileSync(
      join(home.codexDir, 'models_cache.json'),
      JSON.stringify({
        fetched_at: '2026-10-06T04:30:00Z',
        models: [{ slug: 'new', visibility: 'list' }],
      }),
    );
    const changed = await detectModels(home.env, { now: FRESH + 3000 });
    expect(changed[1]!.models.map((m) => m.id)).toEqual(['new']);
    expect((await detectModels(home.env, { now: FRESH + 4000 }))[1]).toBe(changed[1]);
    expect((await detectModels(home.env, { now: FRESH + 5000, refresh: true }))[1]).not.toBe(
      changed[1],
    );
  });
});

describe('GET /api/models', () => {
  it('answers any signed-in role and nobody else, and never serves more than the schema allows', async () => {
    const home = withCaches();
    Object.assign(process.env, {
      AETHER_CLAUDE_HOME: home.env['AETHER_CLAUDE_HOME'],
      AETHER_CODEX_HOME: home.env['AETHER_CODEX_HOME'],
    });
    const { createServer } = await import('../../apps/control/src/server.js');
    const f = fixture();
    const app = createServer(f.control, { origin: 'http://127.0.0.1:4505' });
    const get = (headers: Record<string, string>) =>
      app.inject({
        method: 'GET',
        url: '/api/models?refresh=1',
        headers: { host: '127.0.0.1:4505', ...headers },
      });
    try {
      expect((await get({})).statusCode).toBe(401);
      for (const who of [f.owner, f.sender]) {
        const res = await get({ authorization: `Bearer ${who.token}` });
        expect(res.statusCode).toBe(200);
        const { catalogs } = res.json() as {
          catalogs: { provider: string; models: { id: string }[] }[];
        };
        expect(catalogs.map((c) => c.provider)).toEqual(['claude', 'codex']);
        expect(JSON.stringify(catalogs)).not.toMatch(/token|secret|email/i);
      }
    } finally {
      await app.close();
      delete process.env['AETHER_CLAUDE_HOME'];
      delete process.env['AETHER_CODEX_HOME'];
    }
  });
});
