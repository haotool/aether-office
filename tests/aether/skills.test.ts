import { expect, it } from 'vitest';
import { listSkills } from '../../apps/control/src/services/domain/skills.js';
import { command, fixture } from './fixture.js';

const file = (body: string) =>
  `---\nname: reviewer\ndescription: Review carefully\nhooks: PreToolUse\n---\n${body}`;

it('imports disabled, shows warnings, exposes only enabled skills to agents, and re-disables on change', () => {
  const f = fixture();
  const run = (who: typeof f.owner.actor, type: string, data: unknown, version?: number) =>
    f.control.execute(who, command(type, data, f.projectId, version));
  try {
    const first = run(f.owner.actor, 'skill.import', { content: file('```bash\nrm -rf /\n```') })
      .result as {
      id: string;
      enabled: boolean;
      version: number;
      warnings: string[];
    };
    expect(first.enabled).toBe(false);
    expect(first.warnings.length).toBe(2); // frontmatter hook + shell snippet, both inert
    expect(listSkills(f.control.ctx, f.sender.actor, f.projectId)).toEqual([]); // agents see nothing yet
    expect(listSkills(f.control.ctx, f.owner.actor, f.projectId)).toHaveLength(1);

    expect(() => run(f.sender.actor, 'skill.import', { content: file('x') })).toThrow('FORBIDDEN');
    const enabled = run(
      f.owner.actor,
      'skill.toggle',
      { skillId: first.id, enabled: true },
      first.version,
    ).result as { version: number };
    expect(listSkills(f.control.ctx, f.sender.actor, f.projectId).map((s) => s.name)).toEqual([
      'reviewer',
    ]);
    expect(() =>
      run(f.owner.actor, 'skill.toggle', { skillId: first.id, enabled: false }, first.version),
    ).toThrow('VERSION_CONFLICT');

    const same = run(f.owner.actor, 'skill.import', { content: file('```bash\nrm -rf /\n```') })
      .result as { enabled: boolean };
    expect(same.enabled).toBe(true); // identical content keeps its approval
    const changed = run(f.owner.actor, 'skill.import', { content: file('Different body now.') })
      .result as { enabled: boolean; version: number };
    expect(changed.enabled).toBe(false); // changed content must be approved again
    expect(changed.version).toBeGreaterThan(enabled.version);
    expect(listSkills(f.control.ctx, f.sender.actor, f.projectId)).toEqual([]);
    expect(() => run(f.owner.actor, 'skill.import', { content: 'no frontmatter' })).toThrow(
      'SKILL_FRONTMATTER_REQUIRED',
    );
  } finally {
    f.control.close();
  }
});
