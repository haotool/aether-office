import { execFileSync } from 'node:child_process';
import { describe, expect, it } from 'vitest';
import { mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
import { pathToFileURL } from 'node:url';

const load = (name: string) => import(pathToFileURL(resolve('scripts/quality/release', name)).href);
const loadRoot = (name: string) => import(pathToFileURL(resolve('scripts/quality', name)).href);

const { validateGatesFile, loadGates, gateRow, SCHEMA } = await load('gates-evidence.mjs');
const { GATE_COMMANDS } = await load('gates.mjs');
const { parseFanInAllowlist, FAN_IN_ALLOW_MAX } = await load('adr-allowlist.mjs');
const { measureFanIn } = await load('measure.mjs');
const { scoreRelease } = await load('run.mjs');
const { diskRepo, memoryRepo } = await loadRoot('repo.mjs');

const git = (cwd: string, ...args: string[]) =>
  execFileSync('git', ['-c', 'user.name=t', '-c', 'user.email=t@example.com', ...args], {
    cwd,
    encoding: 'utf8',
  }).trim();

function withCleanRepo(run: (root: string, head: string) => void) {
  const root = mkdtempSync(join(tmpdir(), 'aether-gates-clean-'));
  try {
    git(root, 'init');
    writeFileSync(join(root, 'README.md'), '# x\n');
    git(root, 'add', 'README.md');
    git(root, 'commit', '-m', 'chore: init');
    run(root, git(root, 'rev-parse', 'HEAD'));
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
}

describe('gates evidence validation', () => {
  it('rejects sha mismatch', () => {
    withCleanRepo((root) => {
      const got = validateGatesFile(
        { schema: SCHEMA, sha: '0'.repeat(40), dirty: 0, gates: [] },
        root,
      );
      expect(got.error).toMatch(/does not match HEAD/);
    });
  });

  it('rejects non-integer exit', () => {
    withCleanRepo((root, head) => {
      const got = validateGatesFile(
        {
          schema: SCHEMA,
          sha: head,
          dirty: 0,
          gates: [{ id: 'L1-01', exit: 0.5, command: 'x' }],
        },
        root,
      );
      expect(got.error).toMatch(/exit must be an integer/);
    });
  });

  it('rejects duplicate gate ids', () => {
    withCleanRepo((root, head) => {
      const got = validateGatesFile(
        {
          schema: SCHEMA,
          sha: head,
          dirty: 0,
          gates: [
            { id: 'L1-01', exit: 0 },
            { id: 'L1-01', exit: 0 },
          ],
        },
        root,
      );
      expect(got.error).toMatch(/duplicate gate id/);
    });
  });

  it('rejects non-G criterion ids', () => {
    withCleanRepo((root, head) => {
      const got = validateGatesFile(
        { schema: SCHEMA, sha: head, dirty: 0, gates: [{ id: 'L1-02', exit: 0 }] },
        root,
      );
      expect(got.error).toMatch(/not a G criterion/);
    });
  });

  it('maps exit 0 to full G credit', () => {
    const row = gateRow('L1-01', { id: 'L1-01', exit: 0, command: 'pnpm typecheck' });
    expect(row.credit).toBe(1);
    expect(row.status).toBe('measured');
  });
});

describe('gates dirty field', () => {
  it('rejects non-zero dirty on a clean tree', () => {
    withCleanRepo((root, head) => {
      const got = validateGatesFile(
        { schema: SCHEMA, sha: head, dirty: 2, gates: [{ id: 'L1-01', exit: 0 }] },
        root,
      );
      expect(got.error).toMatch(/dirty must be 0/);
      expect(got.gates.size).toBe(0);
    });
  });

  it('keeps all G criteria unmeasured when gates file is dirty', async () => {
    const root = resolve('.');
    const head = git(root, 'rev-parse', 'HEAD');
    const gatesPath = join(tmpdir(), `aether-gates-dirty-${Date.now()}.json`);
    writeFileSync(
      gatesPath,
      JSON.stringify({
        schema: SCHEMA,
        sha: head,
        dirty: 1,
        gates: [{ id: 'L1-01', exit: 0, command: 'pnpm typecheck' }],
      }),
    );
    const report = await scoreRelease(root, { gatesPath });
    expect(report.gatesError).toMatch(/dirty must be 0/);
    const g = report.criteria.filter((c: { type: string }) => c.type === 'G');
    expect(g.every((c: { status: string }) => c.status === 'unmeasured')).toBe(true);
    expect(g.every((c: { detail: string[] }) => c.detail[0]?.includes('dirty must be 0'))).toBe(
      true,
    );
    rmSync(gatesPath, { force: true });
  }, 60_000);
});

describe('loadGates', () => {
  it('surfaces sha mismatch through loadGates', () => {
    withCleanRepo((root, head) => {
      const rel = 'gates.json';
      writeFileSync(
        join(root, rel),
        JSON.stringify({
          schema: SCHEMA,
          sha: '0'.repeat(40),
          dirty: 0,
          gates: [{ id: 'L1-01', exit: 0, command: 'x' }],
        }),
      );
      const loaded = loadGates(diskRepo(root), rel);
      expect(loaded.error).toMatch(/does not match HEAD/);
      expect(head.length).toBe(40);
    });
  });
});

describe('fan-in ADR allowlist', () => {
  it('ignores allowlisted paths and flags excess declarations', () => {
    const repo = memoryRepo({
      'docs/adr/a.md': 'fan-in-allow: apps/web/src/hub.ts\n',
      'apps/web/src/hub.ts': 'export {}',
      'docs/adr/b.md': [
        'fan-in-allow: apps/web/src/a.ts',
        'fan-in-allow: apps/web/src/b.ts',
        'fan-in-allow: apps/web/src/c.ts',
        'fan-in-allow: apps/web/src/d.ts',
        'fan-in-allow: apps/web/src/e.ts',
        'fan-in-allow: apps/web/src/f.ts',
      ].join('\n'),
    });
    const allow = parseFanInAllowlist(repo);
    expect(allow.allowed.has('apps/web/src/hub.ts')).toBe(true);
    expect(allow.violations).toBeGreaterThan(0);
    const runtime = new Map<string, Set<string>>();
    for (let i = 0; i < 35; i += 1)
      runtime.set(`apps/web/src/x${i}.ts`, new Set(['apps/web/src/hub.ts']));
    expect(measureFanIn({ runtime, uses: [] }, repo).violations).toBe(allow.violations);
  });

  it('counts missing allow targets as violations', () => {
    const repo = memoryRepo({ 'docs/adr/x.md': 'fan-in-allow: missing/file.ts\n' });
    expect(parseFanInAllowlist(repo).violations).toBe(1);
  });

  it('flags exactly one violation when six existing paths are declared', () => {
    const paths = Array.from({ length: 6 }, (_, i) => `apps/web/src/fan-in-cap-${i}.ts`);
    const contents: Record<string, string> = {
      'docs/adr/six-cap.md': `${paths.map((p) => `fan-in-allow: ${p}`).join('\n')}\n`,
    };
    for (const p of paths) contents[p] = 'export {}\n';
    expect(parseFanInAllowlist(memoryRepo(contents)).violations).toBe(1);
    expect(FAN_IN_ALLOW_MAX).toBe(5);
  });
});

describe('quality:gates command table', () => {
  it('includes cheap gates used in ACCEPT smoke', () => {
    expect(GATE_COMMANDS['L1-01']).toBeDefined();
    expect(GATE_COMMANDS['L2-07']).toBeDefined();
    expect(GATE_COMMANDS['L7-01']).toBeDefined();
  });
});
