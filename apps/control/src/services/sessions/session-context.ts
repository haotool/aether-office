import type { LocalSession, ModelCatalog } from '@aether/contracts';

type Usage = LocalSession['usage'];
type Provider = LocalSession['provider'];

const CLAUDE_WINDOW = 200_000;
const CLAUDE_WINDOW_LONG = 1_000_000;

export function windowsOf(catalogs: readonly ModelCatalog[]): ReadonlyMap<string, number> {
  const out = new Map<string, number>();
  for (const catalog of catalogs)
    for (const model of catalog.models)
      if (model.contextWindow) out.set(`${catalog.provider}:${model.id}`, model.contextWindow);
  return out;
}

type WindowBasis = NonNullable<Usage['contextWindowBasis']>;

export function resolveContextWindowBasis(
  provider: Provider,
  model: string | null,
  observed: number | null,
  tokens: number | null,
  windows: ReadonlyMap<string, number>,
): { window: number; basis: WindowBasis } | null {
  if (observed && observed > 0) return { window: observed, basis: 'observed' };
  const listed = model ? windows.get(`${provider}:${model}`) : undefined;
  if (listed) return { window: listed, basis: 'catalog' };
  if (provider === 'codex') return null;
  if (model && /\[1m\]$/i.test(model)) return { window: CLAUDE_WINDOW_LONG, basis: 'model' };
  if (!model && tokens === null) return null;
  return tokens !== null && tokens > CLAUDE_WINDOW
    ? { window: CLAUDE_WINDOW_LONG, basis: 'inferred' }
    : { window: CLAUDE_WINDOW, basis: 'assumed' };
}

export const resolveContextWindow = (
  ...args: Parameters<typeof resolveContextWindowBasis>
): number | null => resolveContextWindowBasis(...args)?.window ?? null;

export function contextPct(tokens: number | null, window: number | null): number | null {
  if (tokens === null || !window) return null;
  return Math.round(Math.min(100, (tokens / window) * 100) * 10) / 10;
}

export function withContext(
  provider: Provider,
  usage: Usage,
  windows: ReadonlyMap<string, number>,
): Usage {
  const resolved = resolveContextWindowBasis(
    provider,
    usage.model,
    usage.contextWindow,
    usage.contextTokens,
    windows,
  );
  const contextWindow = resolved?.window ?? null;
  return {
    ...usage,
    contextWindow,
    contextWindowBasis: resolved?.basis ?? null,
    contextPct: contextPct(usage.contextTokens, contextWindow),
  };
}

const MARKER = {
  claude: '"subtype":"compact_boundary"',
  codex: '"type":"compacted"',
} as const;
const STAMP = /"timestamp":"([^"]+)"/;
const SCAN_BYTES = 64 * 1024;

export function compactedAtOf(provider: Provider, tail: Buffer): number | null {
  let from = tail.length;
  while (from > 0) {
    const hit = tail.lastIndexOf(MARKER[provider], from - 1);
    if (hit < 0) return null;
    const start = tail.lastIndexOf(10, hit) + 1;
    const stop = tail.indexOf(10, hit);
    const line = tail.toString(
      'utf8',
      start,
      Math.min(stop < 0 ? tail.length : stop, start + SCAN_BYTES),
    );
    const at = Date.parse(STAMP.exec(line)?.[1] ?? '');
    if (Number.isFinite(at)) return at;
    from = start;
  }
  return null;
}
