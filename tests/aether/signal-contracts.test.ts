import { describe, expect, it } from 'vitest';
import { COMMAND_TAGS } from '../../packages/providers/src/command-tags.mjs';
import {
  commandTagSchema,
  localSessionSchema,
  subagentSchema,
} from '../../packages/contracts/src/index.js';

describe('the signal enrichment fields', () => {
  it('keep the contract enum and the classifier vocabulary the same list', () => {
    expect([...commandTagSchema.options].sort()).toEqual([...COMMAND_TAGS].sort());
  });

  it('parse an older payload with "not known" defaults', () => {
    const child = subagentSchema.parse({ id: 'a', type: 'Explore', lastSeen: 1 });
    expect([child.label, child.tokens, child.result]).toEqual([null, null, null]);
  });

  it('are bounded: a label of 61, a summary of 161 characters, a negative token count', () => {
    const base = { id: 'a', type: 'Explore', lastSeen: 1 };
    expect(subagentSchema.safeParse({ ...base, label: 'x'.repeat(60) }).success).toBe(true);
    expect(subagentSchema.safeParse({ ...base, label: 'x'.repeat(61) }).success).toBe(false);
    const result = (summary: string) => ({ summary, error: null, chars: 3 });
    expect(subagentSchema.safeParse({ ...base, result: result('x'.repeat(160)) }).success).toBe(
      true,
    );
    expect(subagentSchema.safeParse({ ...base, result: result('x'.repeat(161)) }).success).toBe(
      false,
    );
    const tokens = (total: number) => ({ total, perMinute: 0, sampledAt: 1 });
    expect(subagentSchema.safeParse({ ...base, tokens: tokens(-1) }).success).toBe(false);
    expect(subagentSchema.safeParse({ ...base, tokens: tokens(1.5) }).success).toBe(false);
  });

  it('only allow a label from the closed vocabulary on a tool call, at most four', () => {
    const session = (recent: object[]) => ({
      hook: { activity: 'working', lastEvent: 'x', tool: null, at: 1, recent },
    });
    const parse = (recent: object[]) =>
      localSessionSchema.shape.hook.unwrap().safeParse(session(recent).hook).success;
    const call = (tags: string[]) => ({ tool: 'Bash', target: null, at: 1, tags });
    expect(parse([call(['test', 'git.push'])])).toBe(true);
    expect(parse([call(['rm -rf /'])])).toBe(false);
    expect(parse([call(['test', 'build', 'lint', 'install', 'docker'])])).toBe(false);
    expect(commandTagSchema.safeParse('git.push.force').success).toBe(true);
    expect(parse([{ tool: 'Bash', target: null, at: 1 }])).toBe(true);
  });
});
