import { expect, it } from 'vitest';
import { parseSkill } from '../../packages/kernel/src/index.js';

const skill = (front: string, body = 'Do the thing.') => `---\n${front}\n---\n${body}`;

it('parses name, description and body from frontmatter', () => {
  expect(parseSkill(skill('name: code-review\ndescription: "Review a diff"\nauthor: x'))).toEqual({
    name: 'code-review',
    description: 'Review a diff',
    body: 'Do the thing.',
    warnings: [],
  });
});

it('flags executable declarations and shell snippets instead of honouring them', () => {
  const parsed = parseSkill(
    skill(
      'name: risky\ndescription: d\nhooks: PreToolUse\nallowed-tools: Bash',
      '```bash\nrm -rf /\n```',
    ),
  );
  expect(parsed.warnings).toHaveLength(3);
  expect(parsed.warnings.join(' ')).toContain('ignored');
  expect(parsed.warnings.join(' ')).toContain('never run');
});

it('rejects missing frontmatter, bad names, missing descriptions and oversized files', () => {
  expect(() => parseSkill('no frontmatter')).toThrow('SKILL_FRONTMATTER_REQUIRED');
  expect(() => parseSkill(skill('name: ../evil\ndescription: d'))).toThrow('SKILL_NAME_INVALID');
  expect(() => parseSkill(skill('name: ok'))).toThrow('SKILL_DESCRIPTION_REQUIRED');
  expect(() => parseSkill(skill('name: big\ndescription: d', 'x'.repeat(70_000)))).toThrow(
    'SKILL_TOO_LARGE',
  );
});
