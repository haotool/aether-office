import { mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
import { pathToFileURL } from 'node:url';
import { afterEach, describe, expect, it, vi } from 'vitest';

const spawnSyncMock = vi.hoisted(() => vi.fn<typeof import('node:child_process').spawnSync>());

vi.mock('node:child_process', async (importOriginal) => {
  const actual = await importOriginal<typeof import('node:child_process')>();
  return { ...actual, spawnSync: spawnSyncMock };
});

const gateModuleUrl = pathToFileURL(resolve('scripts/oss/audit-gate.mjs')).href;
const {
  classifyAdvisorySeverity,
  evaluateAudit,
  isExpired,
  listBlockedFindings,
  parseAuditJsonInput,
  runGate,
  validateExceptions,
} = await import(gateModuleUrl);

function auditWithSeverity(severity: unknown) {
  const row: Record<string, unknown> = {
    id: 99,
    module_name: 'fixture-pkg',
    github_advisory_id: 'GHSA-fixture',
  };
  if (severity !== undefined) row.severity = severity;
  return { advisories: { '99': row } };
}

const exceptionsPath = resolve('docs/security/audit-exceptions.json');

const clean = {
  advisories: {},
  metadata: { vulnerabilities: { high: 0, critical: 0 } },
};

const oneHigh = {
  advisories: {
    '1241209': {
      id: 1241209,
      module_name: 'source-map-js',
      severity: 'high',
      github_advisory_id: 'GHSA-68fv-2mgg-jv7q',
    },
  },
  metadata: { vulnerabilities: { high: 1, critical: 0 } },
};

describe('audit gate', () => {
  it('passes when there are no high or critical advisories', () => {
    expect(listBlockedFindings(clean)).toEqual([]);
    expect(evaluateAudit(clean, []).ok).toBe(true);
  });

  it('blocks an unexempted high advisory', () => {
    const result = evaluateAudit(oneHigh, []);
    expect(result.ok).toBe(false);
    expect(result.blocked).toHaveLength(1);
    expect(result.blocked[0]?.package).toBe('source-map-js');
  });

  it('allows a matching exception before expiry', () => {
    const exceptions = validateExceptions([
      {
        advisory: 'GHSA-68fv-2mgg-jv7q',
        package: 'source-map-js',
        reason: 'fixture only',
        expires: '2099-12-31',
      },
    ]);
    expect(evaluateAudit(oneHigh, exceptions).ok).toBe(true);
  });

  it('fails when an exception has expired', () => {
    const exceptions = validateExceptions([
      {
        advisory: 'GHSA-68fv-2mgg-jv7q',
        package: 'source-map-js',
        reason: 'temporary',
        expires: '2020-01-01',
      },
    ]);
    const result = evaluateAudit(oneHigh, exceptions, new Date('2026-01-01'));
    expect(result.ok).toBe(false);
    expect(result.expired).toHaveLength(1);
  });

  it('treats missing advisories with high counts as blocked (format defense)', () => {
    const weird = { metadata: { vulnerabilities: { high: 2, critical: 0 } } };
    const result = evaluateAudit(weird, []);
    expect(result.ok).toBe(false);
    expect(result.blocked[0]?.advisory).toBe('unknown');
  });
});

describe('isExpired', () => {
  it('expires at end of the given UTC day', () => {
    expect(isExpired('2026-01-01', new Date('2026-01-01T12:00:00Z'))).toBe(false);
    expect(isExpired('2026-01-01', new Date('2026-01-02T00:00:01Z'))).toBe(true);
  });
});

describe('classifyAdvisorySeverity', () => {
  it('allows only info, low, and moderate', () => {
    for (const sev of ['info', 'low', 'moderate'] as const) {
      expect(classifyAdvisorySeverity(sev)).toEqual({ block: false, severity: sev });
    }
  });

  it('blocks high and critical with case and whitespace normalization', () => {
    expect(classifyAdvisorySeverity('High')).toEqual({
      block: true,
      severity: 'high',
      unreadable: false,
    });
    expect(classifyAdvisorySeverity('HIGH')).toEqual({
      block: true,
      severity: 'high',
      unreadable: false,
    });
    expect(classifyAdvisorySeverity(' high ')).toEqual({
      block: true,
      severity: 'high',
      unreadable: false,
    });
  });

  it('blocks missing, null, non-string, empty, and unknown severities as unreadable', () => {
    for (const raw of [null, 7, '', 'urgent'] as const) {
      expect(classifyAdvisorySeverity(raw)).toEqual({
        block: true,
        severity: 'unreadable',
        unreadable: true,
      });
    }
    expect(classifyAdvisorySeverity(undefined)).toEqual({
      block: true,
      severity: 'unreadable',
      unreadable: true,
    });
  });
});

describe('listBlockedFindings severity fail-closed', () => {
  it('does not list allowed severities', () => {
    for (const sev of ['moderate', 'low', 'info']) {
      expect(listBlockedFindings(auditWithSeverity(sev))).toEqual([]);
    }
  });

  it('blocks advisories with unreadable severity', () => {
    const missing = auditWithSeverity(undefined);
    delete (missing.advisories['99'] as Record<string, unknown>).severity;
    const blocked = listBlockedFindings(missing);
    expect(blocked).toHaveLength(1);
    expect(blocked[0]?.severityUnreadable).toBe(true);
    expect(evaluateAudit(missing, []).ok).toBe(false);
  });

  it('blocks unknown severity strings', () => {
    const blocked = listBlockedFindings(auditWithSeverity('urgent'));
    expect(blocked[0]?.severity).toBe('unreadable');
    expect(blocked[0]?.severityUnreadable).toBe(true);
  });
});

describe('parseAuditJsonInput', () => {
  it('rejects empty or invalid audit JSON strings', () => {
    expect(parseAuditJsonInput('')).toMatchObject({ error: expect.any(String) });
    expect(parseAuditJsonInput('   ')).toMatchObject({ error: expect.any(String) });
    expect(parseAuditJsonInput('{')).toMatchObject({ error: expect.any(String) });
  });
});

describe('runGate tool errors (exit 2)', () => {
  afterEach(() => {
    spawnSyncMock.mockReset();
  });

  it('returns 2 for bad or empty auditJson input', () => {
    expect(runGate(exceptionsPath, { auditJson: '', skipAudit: true })).toBe(2);
    expect(runGate(exceptionsPath, { auditJson: '{not-json', skipAudit: true })).toBe(2);
  });

  it('returns 2 when the exceptions file is missing, invalid JSON, or wrong shape', () => {
    expect(runGate(join(tmpdir(), 'audit-gate-missing-exceptions.json'), { skipAudit: true })).toBe(
      2,
    );
    const dir = mkdtempSync(join(tmpdir(), 'audit-gate-ex-'));
    try {
      const badJson = join(dir, 'bad.json');
      writeFileSync(badJson, '{');
      expect(runGate(badJson, { skipAudit: true })).toBe(2);

      const badShape = join(dir, 'shape.json');
      writeFileSync(badShape, '{"advisory":"x"}');
      expect(runGate(badShape, { skipAudit: true })).toBe(2);
    } finally {
      rmSync(dir, { recursive: true, force: true });
    }
  });

  it('returns 2 when pnpm audit produces no JSON output', () => {
    spawnSyncMock.mockReturnValue({
      stdout: '',
      stderr: '',
      status: 1,
      signal: null,
      output: [null, ''],
      pid: 0,
      error: undefined,
    });
    expect(runGate(exceptionsPath)).toBe(2);
  });

  it('returns 1 for a high advisory passed via auditJson', () => {
    expect(
      runGate(exceptionsPath, {
        auditJson: JSON.stringify(oneHigh),
        skipAudit: true,
      }),
    ).toBe(1);
  });
});
