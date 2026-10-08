import { describe, expect, it } from 'vitest';
import { normalizeSessions } from '../../apps/web/src/lib/sessions/local-session-compat.js';
import type { LocalSessionsResponse } from '../../packages/contracts/src/index.js';

describe('a session from a control plane older than this page', () => {
  it('gets the later fields filled in so nothing reads undefined', () => {
    // The shape before confidence/evidence, contextPct/compactedAt and hook.recent existed.
    const old = {
      enabled: true,
      sessions: [
        {
          key: 'k',
          classification: {
            role: 'generalist',
            department: 'product',
            basis: 'default',
            matched: null,
          },
          usage: {
            model: null,
            contextTokens: null,
            contextWindow: null,
            freshTokens: null,
            limit: null,
          },
          hook: { activity: 'working', tool: 'Bash' },
          git: { branch: 'main', upstream: null, ahead: 0, behind: 0, uncommitted: 1 },
        },
      ],
    } as unknown as LocalSessionsResponse;
    const [s] = normalizeSessions(old).sessions;
    expect(s!.classification.evidence).toEqual([]);
    expect(s!.classification.confidence).toBe(0);
    expect(s!.usage.contextPct).toBeNull();
    expect(s!.usage.compactedAt).toBeNull();
    expect(s!.hook?.recent).toEqual([]);
    expect(s!.git?.conflicts).toBe(0);
  });

  it('fills a call from before labels and outcomes with "no label, outcome not known"', () => {
    const old = {
      enabled: true,
      sessions: [
        {
          key: 'k',
          classification: { role: 'qa', department: 'quality' },
          usage: {},
          hook: { recent: [{ tool: 'Bash', target: 'pnpm test', at: 1 }] },
        },
      ],
    } as unknown as LocalSessionsResponse;
    expect(normalizeSessions(old).sessions[0]!.hook?.recent).toEqual([
      { tool: 'Bash', target: 'pnpm test', at: 1, agentId: null, tags: [], ok: null },
    ]);
  });

  it('keeps a current session as it is', () => {
    const now = {
      enabled: true,
      sessions: [
        {
          key: 'k',
          classification: {
            role: 'qa',
            department: 'quality',
            confidence: 0.8,
            evidence: ['tests'],
          },
          usage: { contextPct: 41.5, compactedAt: 7 },
          hook: { recent: [{ tool: 'Edit', target: 'a.ts' }] },
        },
      ],
    } as unknown as LocalSessionsResponse;
    const [s] = normalizeSessions(now).sessions;
    expect(s!.classification.evidence).toEqual(['tests']);
    expect(s!.usage.contextPct).toBe(41.5);
    expect(s!.hook?.recent).toHaveLength(1);
  });
});
