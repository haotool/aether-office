import type { LocalSession, ModelCatalog } from '@aether/contracts';

// How full a session's context window is, and when the CLI last compacted it. Counters and a timestamp only: nothing
// of the conversation is read, kept or returned.
type Usage = LocalSession['usage'];
type Provider = LocalSession['provider'];

/** A Claude model's window unless the transcript or catalog says otherwise; `[1m]` models have a million tokens. */
const CLAUDE_WINDOW = 200_000;
const CLAUDE_WINDOW_LONG = 1_000_000;

/** Model id to window size, from the detected model catalogs (only entries that state one). */
export function windowsOf(catalogs: readonly ModelCatalog[]): ReadonlyMap<string, number> {
  const out = new Map<string, number>();
  for (const catalog of catalogs)
    for (const model of catalog.models)
      if (model.contextWindow) out.set(`${catalog.provider}:${model.id}`, model.contextWindow);
  return out;
}

/** Where a context window came from: the CLI's own figure, a model catalog, the model id, or a guess about Claude. */
export type WindowBasis = NonNullable<Usage['contextWindowBasis']>;

/**
 * Pure. The window the context in use is measured against, and how it is known. Codex records it with every turn
 * (`observed`); Claude's transcript does not, so it is the catalog's figure for the model (`catalog`), a million for a
 * `[1m]` model (`model`), else 200k, which is an `assumed` window. Claude Code does not write the long-context choice into
 * the assistant message, so a session that already holds more than 200k can only be a 1M session, and its window is
 * `inferred` as 1M: the percentage then falls when the context crosses 200k, and the basis says why. Unknown model and
 * nothing observed → null.
 */
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

/** Pure. The window alone (see `resolveContextWindowBasis`). */
export const resolveContextWindow = (
  ...args: Parameters<typeof resolveContextWindowBasis>
): number | null => resolveContextWindowBasis(...args)?.window ?? null;

/** Pure. Share of the window in use, 0 to 100 with one decimal; null while either side is unknown. */
export function contextPct(tokens: number | null, window: number | null): number | null {
  if (tokens === null || !window) return null;
  return Math.round(Math.min(100, (tokens / window) * 100) * 10) / 10;
}

/** Pure. `usage` with its window resolved and the share worked out. */
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

// What each CLI writes when it compacts: Claude a `system` entry with subtype `compact_boundary`, Codex an item of type
// `compacted`. The needle is searched as bytes; only the one line it sits on is decoded, and only for its timestamp.
const MARKER = {
  claude: '"subtype":"compact_boundary"',
  codex: '"type":"compacted"',
} as const;
const STAMP = /"timestamp":"([^"]+)"/;
const SCAN_BYTES = 64 * 1024; // a Claude boundary line is a few KB; a Codex one begins with its timestamp

/** Pure. When the tail's latest compaction marker was written (epoch ms); null when there is none or no usable time. */
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
    from = start; // a marker whose line lost its start to the tail cut: look for an earlier one
  }
  return null;
}
