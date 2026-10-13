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

  it('matches a clean annotated tag when one is being published', () => {
    const tag = process.env['AETHER_RELEASE_TAG'];
    if (!tag) return;
    expect(tag).toBe(`v${version}`);
    expect(git('cat-file', '-t', tag)).toEqual(['tag']);
    expect(git('rev-list', '-n', '1', tag)).toEqual(git('rev-parse', 'HEAD'));
    expect(git('status', '--porcelain')).toEqual([]);
    const changelog = read('CHANGELOG.md');
    const previous = git('tag', '--sort=-version:refname').find(
      (name) => name !== tag && /^v\d+\.\d+\.\d+$/.test(name),
    );
    for (const line of [
      `## [${version}] - `,
      `[Unreleased]: https://github.com/haotool/aether-office/compare/${tag}...HEAD`,
      `[${version}]: https://github.com/haotool/aether-office/compare/${previous}...${tag}`,
    ])
      expect(changelog).toContain(line);
  });
});
