import { describe, expect, it } from 'vitest';
import { ClaimBook } from '../../apps/control/src/services/usage-claude.js';
import { deltaOf } from '../../apps/control/src/services/usage-codex.js';
import {
  fresh,
  newState,
  type Bucket,
  type ParseState,
} from '../../apps/control/src/services/usage-counters.js';
import { dayKeyOf, parseChunk } from '../../apps/control/src/services/usage-parse.js';
import { buffer, claudeLine, codexContext, codexCount, codexTool } from './usage-fixtures.js';

const utc = dayKeyOf('UTC');
const taipei = dayKeyOf('Asia/Taipei');
const totals = (state: ParseState) => {
  const sum = { i: 0, o: 0, cr: 0, cw: 0, r: 0, req: 0, tools: 0, ms: 0 };
  for (const b of Object.values(state.days))
    for (const k of Object.keys(sum) as (keyof typeof sum)[]) sum[k] += b[k];
  return sum;
};

describe('Claude transcripts', () => {
  it('counts a message once however many lines repeat its usage, taking the latest output count', () => {
    const state = newState('claude');
    parseChunk(
      state,
      buffer(
        claudeLine('msg_1', '2026-10-07T01:00:00.000Z', { i: 3, cw: 100, cr: 5000, o: 10 }),
        claudeLine(
          'msg_1',
          '2026-10-07T01:00:01.000Z',
          { i: 3, cw: 100, cr: 5000, o: 120 },
          { tools: 2 },
        ),
        claudeLine('msg_1', '2026-10-07T01:00:02.000Z', { i: 3, cw: 100, cr: 5000, o: 120 }),
        claudeLine(
          'msg_2',
          '2026-10-07T01:00:30.000Z',
          { i: 1, cw: 0, cr: 5100, o: 40 },
          { tools: 1 },
        ),
      ),
      utc,
    );
    expect(totals(state)).toMatchObject({
      i: 4,
      cw: 100,
      cr: 10100,
      o: 160,
      req: 2,
      tools: 3,
      r: 0,
    });
  });

  it('splits tokens by model and keeps the model of a day apart from another', () => {
    const state = newState('claude');
    parseChunk(
      state,
      buffer(
        claudeLine('a', '2026-10-07T01:00:00.000Z', { i: 10, o: 20 }, { model: 'claude-opus-5-5' }),
        claudeLine('b', '2026-10-07T01:01:00.000Z', { i: 1, o: 2 }, { model: 'claude-haiku-5' }),
        claudeLine('c', '2026-10-07T01:02:00.000Z', { i: 0, o: 0 }, { model: '<synthetic>' }),
      ),
      utc,
    );
    expect(state.days['2026-10-07']!.m).toEqual({ 'claude-opus-5-5': 30, 'claude-haiku-5': 3 });
  });

  it('ignores usage that is not a message of its own (a tool result carrying counters)', () => {
    const state = newState('claude');
    const stray = JSON.stringify({
      type: 'user',
      message: { role: 'user', content: [{ type: 'tool_result', tool_use_id: 't', content: 'x' }] },
      toolUseResult: { usage: { input_tokens: 999, output_tokens: 999 } },
      timestamp: '2026-10-07T01:00:00.000Z',
    });
    parseChunk(state, buffer(stray), utc);
    expect(totals(state)).toMatchObject({ i: 0, o: 0, req: 0 });
  });

  it('puts a late-evening UTC event on the next local day in Taipei and keeps it on the same day in UTC', () => {
    const line = claudeLine('m', '2026-10-06T17:30:00.000Z', { i: 7, o: 3 });
    const inUtc = newState('claude');
    const inTaipei = newState('claude');
    parseChunk(inUtc, buffer(line), utc);
    parseChunk(inTaipei, buffer(line), taipei);
    expect(Object.keys(inUtc.days)).toEqual(['2026-10-06']);
    expect(Object.keys(inTaipei.days)).toEqual(['2026-10-07']);
  });

  it('counts active time over gaps of at most five minutes and not across longer ones', () => {
    const state = newState('claude');
    parseChunk(
      state,
      buffer(
        claudeLine('1', '2026-10-07T01:00:00.000Z', { i: 1, o: 1 }),
        claudeLine('2', '2026-10-07T01:03:00.000Z', { i: 1, o: 1 }), // +3 min: counted
        claudeLine('3', '2026-10-07T01:20:00.000Z', { i: 1, o: 1 }), // +17 min: an idle break
        claudeLine('4', '2026-10-07T01:21:00.000Z', { i: 1, o: 1 }), // +1 min: counted
      ),
      utc,
    );
    expect(totals(state).ms).toBe(4 * 60_000);
  });
});

describe('Claude messages seen twice', () => {
  const at = '2026-10-07T01:00:00.000Z';
  const u = { i: 3, cw: 100, cr: 5000, o: 10 };

  it('does not count a synthetic row as a request', () => {
    const state = newState('claude');
    parseChunk(
      state,
      buffer(
        claudeLine('msg_1', at, { i: 0, o: 0 }, { model: '<synthetic>' }),
        claudeLine('msg_2', at, u),
      ),
      utc,
    );
    expect(totals(state)).toMatchObject({ req: 1, i: 3, o: 10 });
  });

  it('counts a message once when its lines are not adjacent', () => {
    const book = new ClaimBook();
    const state = newState('claude');
    parseChunk(
      state,
      buffer(claudeLine('a', at, u), claudeLine('b', at, u), claudeLine('a', at, u)),
      utc,
      { book, owner: 'f1' },
    );
    expect(totals(state)).toMatchObject({ req: 2, i: 6, o: 20 });
  });

  it('counts one message once across two copies of a transcript, and counts it again once its owner is released', () => {
    const book = new ClaimBook();
    const original = newState('claude');
    const copy = newState('claude');
    const lines = buffer(claudeLine('a', at, u), claudeLine('b', at, u));
    parseChunk(original, lines, utc, { book, owner: 'f1' });
    parseChunk(copy, lines, utc, { book, owner: 'f2' });
    expect(totals(copy)).toMatchObject({ req: 0, i: 0, o: 0 });
    // A copy that goes on past the original counts only what is new.
    parseChunk(copy, buffer(claudeLine('c', at, u)), utc, { book, owner: 'f2' });
    expect(totals(copy)).toMatchObject({ req: 1, i: 3 });
    book.release(new Set(['f1']));
    const again = newState('claude');
    parseChunk(again, lines, utc, { book, owner: 'f3' });
    expect(totals(again)).toMatchObject({ req: 2, i: 6 });
  });

  it('counts a line with a message id but no timestamp as skipped, not as nothing', () => {
    const state = newState('claude');
    parseChunk(state, buffer(claudeLine('a', at, u).replace('"timestamp"', '"stamp"')), utc);
    expect(state.skipped).toBe(1);
    expect(totals(state).req).toBe(0);
  });
});

describe('Codex transcripts', () => {
  const t = (n: number) => `2026-10-07T02:0${n}:00.000Z`;
  const usage = (input: number, cached: number, output: number, reasoning: number) => ({
    input,
    cached,
    output,
    reasoning,
  });

  it('turns running totals into deltas, splitting cached input and reasoning out of input and output', () => {
    const state = newState('codex');
    parseChunk(
      state,
      buffer(
        codexContext(t(0), 'gpt-5.5'),
        codexCount(t(1), usage(1000, 400, 100, 30), usage(1000, 400, 100, 30)),
        codexCount(t(2), usage(2500, 1900, 160, 50), usage(1500, 1500, 60, 20)),
      ),
      utc,
    );
    // total 2500 input with 1900 cached → 600 new; 160 output with 50 reasoning → 110 plain output
    expect(totals(state)).toMatchObject({ i: 600, cr: 1900, o: 110, r: 50, req: 2 });
    expect(state.days['2026-10-07']!.m).toEqual({ 'gpt-5.5': 600 + 110 + 50 });
  });

  it('never counts a repeated token_count twice', () => {
    const state = newState('codex');
    const same = codexCount(t(1), usage(1000, 0, 100, 0), usage(1000, 0, 100, 0));
    parseChunk(
      state,
      buffer(same, same, codexCount(t(2), usage(1000, 0, 100, 0), usage(1000, 0, 100, 0))),
      utc,
    );
    expect(totals(state)).toMatchObject({ i: 1000, o: 100, req: 1 });
  });

  it('counts only a request of its own for the first total of a session continued from another', () => {
    const state = newState('codex');
    parseChunk(
      state,
      buffer(codexCount(t(1), usage(900_000, 800_000, 5000, 0), usage(1200, 1000, 30, 0))),
      utc,
    );
    expect(totals(state)).toMatchObject({ i: 200, cr: 1000, o: 30 });
  });

  it('survives a reset or compaction: a total that falls counts the new request, then deltas resume', () => {
    const state = newState('codex');
    parseChunk(
      state,
      buffer(
        codexCount(t(1), usage(5000, 0, 500, 0), usage(5000, 0, 500, 0)),
        codexCount(t(2), usage(900, 0, 40, 0), usage(900, 0, 40, 0)), // reset
        codexCount(t(3), usage(1500, 0, 90, 0), usage(600, 0, 50, 0)), // continues from the new total
      ),
      utc,
    );
    expect(totals(state)).toMatchObject({ i: 5000 + 900 + 600, o: 500 + 40 + 50, req: 3 });
  });

  it('carries its state across chunks, so an appended read never re-counts earlier lines', () => {
    const state = newState('codex');
    parseChunk(
      state,
      buffer(codexCount(t(1), usage(1000, 0, 100, 0), usage(1000, 0, 100, 0))),
      utc,
    );
    parseChunk(state, buffer(codexCount(t(2), usage(1800, 0, 150, 0), usage(800, 0, 50, 0))), utc);
    expect(totals(state)).toMatchObject({ i: 1800, o: 150, req: 2 });
  });

  it('follows the model per turn and counts tool calls', () => {
    const state = newState('codex');
    parseChunk(
      state,
      buffer(
        codexContext(t(0), 'gpt-5.5'),
        codexTool(t(0)),
        codexTool(t(0), 'custom_tool_call'),
        codexTool(t(0), 'function_call_output'), // an output is not a call
        codexCount(t(1), usage(100, 0, 10, 0), usage(100, 0, 10, 0)),
        codexContext(t(2), 'gpt-5.5-mini'),
        codexCount(t(3), usage(300, 0, 30, 0), usage(200, 0, 20, 0)),
      ),
      utc,
    );
    expect(totals(state).tools).toBe(2);
    expect(state.days['2026-10-07']!.m).toEqual({ 'gpt-5.5': 110, 'gpt-5.5-mini': 220 });
  });

  it('ignores a rate-limits-only token_count and a cut line', () => {
    const state = newState('codex');
    const limitsOnly = JSON.stringify({
      timestamp: t(1),
      type: 'event_msg',
      payload: { type: 'token_count', info: null, rate_limits: { primary: { used_percent: 1 } } },
    });
    parseChunk(
      state,
      buffer(limitsOnly, codexCount(t(2), usage(10, 0, 1, 0), usage(10, 0, 1, 0)).slice(0, 120)),
      utc,
    );
    expect(totals(state).req).toBe(0);
  });
});

describe('deltaOf', () => {
  const c = (i: number) => ({ i, o: 0, cr: 0, cw: 0, r: 0 });
  it('is the difference while totals grow, zero when unchanged, the request itself after a reset', () => {
    expect(deltaOf(c(10), c(25), c(15)).i).toBe(15);
    expect(fresh(deltaOf(c(10), c(10), c(3)))).toBe(0);
    expect(deltaOf(c(10), c(4), c(4)).i).toBe(4);
    expect(deltaOf(null, c(500), c(20)).i).toBe(20);
    expect(deltaOf(null, c(500), null).i).toBe(500);
  });
});

it('keeps at most a handful of models per day, the rest under "other"', () => {
  const state = newState('claude');
  const lines = Array.from({ length: 12 }, (_, n) =>
    claudeLine(`m${n}`, '2026-10-07T01:00:00.000Z', { i: 1, o: 1 }, { model: `model-${n}` }),
  );
  parseChunk(state, buffer(...lines), utc);
  const models = Object.keys((state.days['2026-10-07'] as Bucket).m);
  expect(models.length).toBeLessThanOrEqual(9);
  expect(models).toContain('other');
});

describe('Claude lines the byte fast path does not match', () => {
  const at = '2026-10-07T01:00:00.000Z';
  const usage = {
    input_tokens: 5,
    output_tokens: 7,
    cache_read_input_tokens: 100,
    cache_creation_input_tokens: 3,
  };
  const message = (id: string, content: unknown[] = []) => ({
    id,
    model: 'claude-opus-5-5',
    role: 'assistant',
    content,
    usage,
  });
  const read = (...lines: string[]) => {
    const state = newState('claude');
    parseChunk(state, buffer(...lines), utc);
    return state;
  };
  const want = { i: 5, o: 7, cr: 100, cw: 3, req: 1 };

  it('reads reordered keys (timestamp first, id after the usage, far from the message start)', () => {
    const line = JSON.stringify({
      timestamp: at,
      type: 'assistant',
      message: {
        content: [{ type: 'text', text: 'x'.repeat(500) }],
        usage,
        model: 'm',
        id: 'late',
        role: 'assistant',
      },
    });
    const state = read(line);
    expect(totals(state)).toMatchObject(want);
    expect(state.fallbacks).toBe(1);
    expect(state.skipped).toBe(0);
  });

  it('reads whitespace-pretty JSON on one line, and counts tool_use blocks', () => {
    const pretty = JSON.stringify(
      {
        type: 'assistant',
        timestamp: at,
        message: message('p', [{ type: 'tool_use' }, { type: 'text' }]),
      },
      null,
      1,
    ).replace(/\n\s*/g, ' ');
    const state = read(pretty);
    expect(totals(state)).toMatchObject({ ...want, tools: 1 });
    expect(state.fallbacks).toBe(1);
  });

  it('counts an assistant line with usage that cannot be read as skipped, a stray usage as nothing', () => {
    const noStamp = JSON.stringify({ type: 'assistant', message: message('b') });
    const cut = '{"type":"assistant", "usage" : {"input_tokens": 1} cut';
    const stray = '{"type":"user", "toolUseResult": {"usage": {"input_tokens": 9}}}';
    const state = read(noStamp, cut, stray);
    expect(state.skipped).toBe(2);
    expect(totals(state).req).toBe(0);
  });

  it('keeps compact ordered lines on the fast path: zero fallbacks however many lines', () => {
    const lines = Array.from({ length: 500 }, (_, k) =>
      claudeLine(`m${k}`, at, { i: 1, o: 1 }, { tools: 1 }),
    );
    const state = read(...lines);
    expect(state.fallbacks).toBe(0);
    expect(totals(state).req).toBe(500);
    parseChunk(state, buffer(claudeLine('next', at, { i: 1, o: 1 })), utc); // warm: only new lines are read
    expect(state.fallbacks).toBe(0);
  });
});
