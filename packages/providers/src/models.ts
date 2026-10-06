import { execFile } from 'node:child_process';
import { readdir, readFile, stat } from 'node:fs/promises';
import { homedir } from 'node:os';
import { join } from 'node:path';
import { promisify } from 'node:util';
import type { ModelCatalog, ModelEntry } from '@aether/contracts';

// The models each provider's CLI offers, read from the CLIs' own private caches so a newly released model shows up
// without an AETHER release. Those files carry no format guarantee: every parser here skips what it does not
// recognise and never throws. Nothing is written, no network is touched and no model is run (`codex debug models`
// prints the local catalog).
const MAX_BYTES = 2 * 1024 * 1024;
const MAX_MODELS = 100;
const DAY_MS = 24 * 3_600_000;
/** A catalog older than this is shown but marked stale. */
export const STALE_MS = 7 * DAY_MS;
/** A Codex cache older than this is refreshed from the CLI when it can be. */
export const CODEX_REFRESH_MS = DAY_MS;
const CLI_TIMEOUT_MS = 5000;
const MEMO_MS = 30_000;
const MEMO_PROBED_MS = 10 * 60_000;
const FAMILIES = ['fable', 'opus', 'sonnet', 'haiku'] as const;
const run = promisify(execFile);

type Json = Record<string, unknown>;
const obj = (v: unknown): Json => (typeof v === 'object' && v !== null ? (v as Json) : {});
const list = (v: unknown): unknown[] => (Array.isArray(v) ? v : []);
const text = (v: unknown, max: number): string | undefined =>
  typeof v === 'string' && v.trim() && v.length <= max ? v.trim() : undefined;
const parse = (raw: string): unknown => {
  try {
    return JSON.parse(raw);
  } catch {
    return undefined;
  }
};
const instant = (v: unknown): number | undefined => {
  const t = typeof v === 'string' ? Date.parse(v) : typeof v === 'number' ? v : NaN;
  return Number.isFinite(t) && t > 0 ? t : undefined;
};
const familyOf = (id: string) => FAMILIES.find((f) => id.includes(f));

/** Pure. Codex's `models_cache.json` / `codex debug models`: visible models only, best priority first. */
export function parseCodexModels(raw: string): { models: ModelEntry[]; fetchedAt?: number } {
  const root = obj(parse(raw));
  const rows = list(root['models'])
    .map(obj)
    .filter((m) => m['visibility'] === 'list' && text(m['slug'], 120))
    .sort((a, b) => Number(a['priority'] ?? 1e9) - Number(b['priority'] ?? 1e9));
  const models = rows.slice(0, MAX_MODELS).map((m): ModelEntry => {
    const id = text(m['slug'], 120)!;
    const efforts = list(m['supported_reasoning_levels'])
      .map((l) => text(obj(l)['effort'], 20))
      .filter((e): e is string => !!e);
    const defaultEffort = text(m['default_reasoning_level'], 20);
    const window = Number(m['context_window']);
    return {
      id,
      label: text(m['display_name'], 80) ?? id,
      efforts,
      ...(defaultEffort && { defaultEffort }),
      isAlias: false,
      ...(Number.isInteger(window) && window > 0 && { contextWindow: window }),
    };
  });
  const fetchedAt = instant(root['fetched_at']);
  return { models, ...(fetchedAt && { fetchedAt }) };
}

/** Pure. One Claude Code `model-catalog/*cc*.json`: the models of its main section, in the order Claude lists them. */
export function parseClaudeCatalog(raw: string): { models: ModelEntry[]; fetchedAt?: number } {
  const root = obj(parse(raw));
  const rows = list(obj(obj(obj(root['catalog'])['config']))['models']).map(obj);
  const models = rows
    .filter((m) => m['section'] === undefined || m['section'] === 'main')
    .flatMap((m): ModelEntry[] => {
      const id = text(m['id'], 120);
      if (!id) return [];
      const options = list(obj(m['thinking'])['effort_options']).map(obj);
      const defaultEffort = text(
        options.find((o) => obj(o['badge'])['message'] === 'Recommended')?.['id'],
        20,
      );
      const family = familyOf(id);
      return [
        {
          id,
          label: text(m['name'], 80) ?? id,
          ...(family && { family }),
          efforts: options.map((o) => text(o['id'], 20)).filter((e): e is string => !!e),
          ...(defaultEffort && { defaultEffort }),
          isAlias: false,
        },
      ];
    })
    .slice(0, MAX_MODELS);
  const fetchedAt = instant(root['fetchedAt']);
  return { models, ...(fetchedAt && { fetchedAt }) };
}

/** Pure. `additionalModelOptionsCache` of `.claude.json`: extra picks such as the 1M-context variants. */
export function parseClaudeExtras(raw: string): ModelEntry[] {
  return list(obj(parse(raw))['additionalModelOptionsCache'])
    .map(obj)
    .flatMap((o): ModelEntry[] => {
      const id = text(o['value'], 120);
      if (!id) return [];
      const family = familyOf(id);
      const name = text(o['description'], 200)?.split(' · ')[0] ?? text(o['label'], 80) ?? id;
      const million = /\[1m\]$/i.test(id);
      return [
        {
          id,
          label: million ? `${name} 1M` : name,
          ...(family && { family }),
          efforts: [],
          isAlias: false,
          ...(million && { contextWindow: 1_000_000 }),
        },
      ];
    })
    .slice(0, MAX_MODELS);
}

/** The family aliases `--model` accepts: always a working choice, borrowing efforts from the newest full ID. */
function withAliases(models: ModelEntry[]): ModelEntry[] {
  const aliases = FAMILIES.map((family): ModelEntry => {
    const newest = models.find((m) => m.family === family && m.efforts.length);
    return {
      id: family,
      label: family[0]!.toUpperCase() + family.slice(1),
      family,
      efforts: newest?.efforts ?? [],
      ...(newest?.defaultEffort && { defaultEffort: newest.defaultEffort }),
      isAlias: true,
    };
  });
  return [...aliases, ...models];
}

type Source = { file: string; mtime: number; size: number };
async function statSource(file: string): Promise<Source | undefined> {
  try {
    const info = await stat(file);
    return info.isFile() && info.size <= MAX_BYTES
      ? { file, mtime: info.mtimeMs, size: info.size }
      : undefined;
  } catch {
    return undefined;
  }
}
const body = (s: Source) => readFile(s.file, 'utf8').catch(() => '');
const signature = (sources: (Source | undefined)[]) =>
  sources.map((s) => (s ? `${s.file}:${s.mtime}:${s.size}` : '-')).join('|');

type Detector = {
  provider: ModelCatalog['provider'];
  sources: (env: NodeJS.ProcessEnv) => Promise<(Source | undefined)[]>;
  detect: (
    env: NodeJS.ProcessEnv,
    sources: (Source | undefined)[],
    now: number,
  ) => Promise<ModelCatalog>;
};

const claudeDir = (env: NodeJS.ProcessEnv) => env['AETHER_CLAUDE_HOME'] ?? env['CLAUDE_CONFIG_DIR'];
const claude: Detector = {
  provider: 'claude',
  async sources(env) {
    const dir = claudeDir(env);
    const catalogDir = join(dir ?? join(homedir(), '.claude'), 'cache', 'model-catalog');
    const names = (await readdir(catalogDir).catch(() => [] as string[])).filter((n) =>
      /cc\.json$|ccd\.json$/.test(n),
    );
    const catalogs = await Promise.all(
      names.slice(0, 8).map((n) => statSource(join(catalogDir, n))),
    );
    // The extras live next to the config directory when one is set, else in the home directory.
    const extras = await statSource(join(dir ?? homedir(), '.claude.json'));
    return [...catalogs, extras];
  },
  async detect(_env, sources, now) {
    const extrasSource = sources.at(-1);
    const found = await Promise.all(
      sources
        .slice(0, -1)
        .flatMap((s) => (s ? [s] : []))
        .map(async (s) => ({ s, ...parseClaudeCatalog(await body(s)) })),
    );
    const best = found
      .filter((c) => c.models.length)
      .sort((a, b) => (b.fetchedAt ?? b.s.mtime) - (a.fetchedAt ?? a.s.mtime))[0];
    const known = best?.models ?? [];
    const extras = (extrasSource ? parseClaudeExtras(await body(extrasSource)) : []).filter(
      (e) => !known.some((m) => m.id === e.id),
    );
    const fetchedAt = best ? (best.fetchedAt ?? best.s.mtime) : undefined;
    return {
      provider: 'claude',
      models: withAliases([...known, ...extras]),
      source: best ? 'cache' : 'fallback',
      ...(fetchedAt && { fetchedAt }),
      stale: fetchedAt === undefined || now - fetchedAt > STALE_MS,
    };
  },
};

async function probeCodexCli(env: NodeJS.ProcessEnv) {
  try {
    const { stdout } = await run('codex', ['debug', 'models'], {
      env: { PATH: env['PATH'] ?? '' },
      timeout: CLI_TIMEOUT_MS,
      maxBuffer: MAX_BYTES * 2,
    });
    const parsed = parseCodexModels(stdout);
    return parsed.models.length ? parsed : undefined;
  } catch {
    return undefined; // no codex on PATH, too slow, or output of a shape we do not know
  }
}

const codex: Detector = {
  provider: 'codex',
  sources: async (env) => [
    await statSource(
      join(
        env['AETHER_CODEX_HOME'] ?? env['CODEX_HOME'] ?? join(homedir(), '.codex'),
        'models_cache.json',
      ),
    ),
  ],
  async detect(env, [cache], now) {
    const cached = cache ? parseCodexModels(await body(cache)) : undefined;
    const models = cached?.models ?? [];
    const cachedAt = models.length ? (cached?.fetchedAt ?? cache?.mtime) : undefined;
    if (cachedAt !== undefined && now - cachedAt <= CODEX_REFRESH_MS)
      return { provider: 'codex', models, source: 'cache', fetchedAt: cachedAt, stale: false };
    const live = await probeCodexCli(env);
    if (live)
      return {
        provider: 'codex',
        models: live.models,
        source: 'cli',
        fetchedAt: now,
        stale: false,
      };
    if (cachedAt !== undefined)
      return {
        provider: 'codex',
        models,
        source: 'cache',
        fetchedAt: cachedAt,
        stale: now - cachedAt > STALE_MS,
      };
    return { provider: 'codex', models: [], source: 'fallback', stale: true };
  },
};

const memo = new Map<string, { sig: string; at: number; value: ModelCatalog }>();

/**
 * Both providers' model lists as the CLIs on this machine know them. Remembered in memory for a short time per source
 * file (mtime + size), so a poller never re-reads or re-spawns; `refresh` skips the memory.
 * Homes: `AETHER_CLAUDE_HOME` (else `CLAUDE_CONFIG_DIR`, else `~/.claude`) and `AETHER_CODEX_HOME` (else `CODEX_HOME`,
 * else `~/.codex`).
 */
export async function detectModels(
  env: NodeJS.ProcessEnv = process.env,
  options: { refresh?: boolean; now?: number } = {},
): Promise<ModelCatalog[]> {
  const now = options.now ?? Date.now();
  return Promise.all(
    [claude, codex].map(async ({ provider, sources, detect }) => {
      const found = await sources(env);
      const sig = signature(found);
      const key = `${provider}:${claudeDir(env) ?? ''}:${env['AETHER_CODEX_HOME'] ?? env['CODEX_HOME'] ?? ''}`;
      const hit = memo.get(key);
      const ttl = hit?.value.source === 'cli' ? MEMO_PROBED_MS : MEMO_MS;
      if (!options.refresh && hit && hit.sig === sig && now - hit.at < ttl) return hit.value;
      const value = await detect(env, found, now);
      memo.set(key, { sig, at: now, value });
      return value;
    }),
  );
}
