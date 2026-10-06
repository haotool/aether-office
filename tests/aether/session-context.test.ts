import { expect, it } from 'vitest';
import {
  compactedAtOf,
  contextPct,
  resolveContextWindow,
  windowsOf,
  withContext,
} from '../../apps/control/src/services/session-context.js';
import { parseUsage } from '../../apps/control/src/services/session-usage.js';

const line = (value: unknown) => JSON.stringify(value);
const none = new Map<string, number>();

// Shapes copied from real transcripts, with every text and id replaced.
const claudeBoundary = line({
  parentUuid: null,
  isSidechain: false,
  type: 'system',
  subtype: 'compact_boundary',
  level: 'info',
  compactMetadata: { trigger: 'auto', preTokens: 168000, postTokens: 9000 },
  uuid: 'u-1',
  timestamp: '2026-10-06T08:30:00.000Z',
  sessionId: 's-1',
});
const claudeAssistant = (input: number, cacheRead: number) =>
  line({
    type: 'assistant',
    message: {
      model: 'claude-opus-5-5',
      id: 'm-1',
      usage: {
        input_tokens: input,
        cache_creation_input_tokens: 0,
        cache_read_input_tokens: cacheRead,
        output_tokens: 10,
      },
    },
  });
const codexCompacted = line({
  timestamp: '2026-10-06T08:31:00.000Z',
  ordinal: 12,
  type: 'compacted',
  payload: { message: '', replacement_history: [], window_number: 2 },
});

it('reads the time of the CLI own compaction marker from the tail, the latest one', () => {
  const second = claudeBoundary.replace('08:30:00', '09:45:00');
  const tail = [claudeBoundary, claudeAssistant(5, 5000), second, claudeAssistant(3, 9000)].join(
    '\n',
  );
  expect(compactedAtOf('claude', Buffer.from(tail))).toBe(Date.parse('2026-10-06T09:45:00.000Z'));
  expect(compactedAtOf('codex', Buffer.from(['{"type":"x"}', codexCompacted].join('\n')))).toBe(
    Date.parse('2026-10-06T08:31:00.000Z'),
  );
});

it('finds no marker, or none with a time, as null', () => {
  expect(compactedAtOf('claude', Buffer.from(claudeAssistant(1, 1)))).toBeNull();
  expect(compactedAtOf('claude', Buffer.from(''))).toBeNull();
  // the marker's line lost its start to the tail cut: no time to read
  expect(
    compactedAtOf('claude', Buffer.from('"subtype":"compact_boundary","level":"info"}')),
  ).toBeNull();
  // a provider's marker is not the other's
  expect(compactedAtOf('codex', Buffer.from(claudeBoundary))).toBeNull();
});

it('puts the marker into the usage a tail read returns', () => {
  const usage = parseUsage(
    'claude',
    Buffer.from([claudeBoundary, claudeAssistant(2, 9000)].join('\n')),
  );
  expect(usage.compactedAt).toBe(Date.parse('2026-10-06T08:30:00.000Z'));
  expect(usage.contextTokens).toBe(9002);
  expect(parseUsage('claude', Buffer.from(claudeAssistant(2, 9000))).compactedAt).toBeNull();
});

it('resolves the window: observed, catalog, [1m], the 200k default, and a million once 200k is passed', () => {
  expect(resolveContextWindow('codex', 'gpt-5', 272000, 1000, none)).toBe(272000);
  const catalogs: Parameters<typeof windowsOf>[0] = [
    {
      provider: 'codex',
      source: 'cache',
      stale: false,
      models: [{ id: 'gpt-x', label: 'x', efforts: [], isAlias: false, contextWindow: 400000 }],
    },
  ];
  const windows = windowsOf(catalogs);
  expect(resolveContextWindow('codex', 'gpt-x', null, 10, windows)).toBe(400000);
  expect(resolveContextWindow('codex', 'gpt-unknown', null, 10, windows)).toBeNull();
  expect(resolveContextWindow('claude', 'claude-opus-5-5[1m]', null, 10, none)).toBe(1_000_000);
  expect(resolveContextWindow('claude', 'claude-opus-5-5', null, 90_000, none)).toBe(200_000);
  expect(resolveContextWindow('claude', 'claude-opus-5-5', null, 250_495, none)).toBe(1_000_000);
  expect(resolveContextWindow('claude', null, null, null, none)).toBeNull();
});

it('works out a bounded share, null while either side is unknown, never invented', () => {
  expect(contextPct(50_000, 200_000)).toBe(25);
  expect(contextPct(1, 3)).toBe(33.3);
  expect(contextPct(300_000, 200_000)).toBe(100);
  expect(contextPct(null, 200_000)).toBeNull();
  expect(contextPct(1000, null)).toBeNull();
  const usage = withContext(
    'claude',
    { ...parseUsage('claude', Buffer.from(claudeAssistant(2, 99_998))), contextWindow: null },
    none,
  );
  expect(usage).toMatchObject({ contextWindow: 200_000, contextPct: 50 });
  expect(withContext('codex', parseUsage('codex', Buffer.from('')), none).contextPct).toBeNull();
});
