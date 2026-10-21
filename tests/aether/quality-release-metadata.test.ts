import { spawnSync } from 'node:child_process';
import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';

const read = (file: string) => readFileSync(file, 'utf8');
const version = (JSON.parse(read('package.json')) as { version: string }).version;
const git = (...args: string[]) =>
  spawnSync('git', args, { encoding: 'utf8' }).stdout.split('\n').filter(Boolean);

describe('release metadata', () => {
  it('uses a stable SemVer triplet', () => {
    expect(version).toMatch(/^(0|[1-9]\d*)\.(0|[1-9]\d*)\.(0|[1-9]\d*)$/);
  });

  it('names the released version and its compare links in the changelog', () => {
    const changelog = read('CHANGELOG.md');
    const [latest, previous] = Array.from(changelog.matchAll(/^## \[([\d.]+)\] - /gm), (m) => m[1]);
    const compare = 'https://github.com/haotool/aether-office/compare';
    expect(latest).toBe(version);
    expect(changelog).toContain(`[Unreleased]: ${compare}/v${version}...HEAD`);
    expect(changelog).toContain(`[${version}]: ${compare}/v${previous}...v${version}`);
  });

  it('matches a clean annotated tag when one is being published', () => {
    const tag = process.env['AETHER_RELEASE_TAG'];
    if (!tag) return;
    expect(tag).toBe(`v${version}`);
    expect(git('cat-file', '-t', tag)).toEqual(['tag']);
    expect(git('rev-list', '-n', '1', tag)).toEqual(git('rev-parse', 'HEAD'));
    expect(git('status', '--porcelain')).toEqual([]);
  });
});
