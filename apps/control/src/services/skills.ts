import { createHash, randomUUID } from 'node:crypto';
import { skillSchema, type Command, type Skill } from '@aether/contracts';
import { assertVersion, DomainError, parseSkill, SkillError, type Actor } from '@aether/kernel';
import type { Context } from './context.js';

type Row = {
  id: string;
  name: string;
  description: string;
  body: string;
  warnings: string;
  enabled: number;
  version: number;
  updatedAt: number;
};

const view = (row: Row): Skill =>
  skillSchema.parse({ ...row, warnings: JSON.parse(row.warnings), enabled: row.enabled === 1 });

/** Humans see every imported skill; agents only ever see the enabled ones. */
export function listSkills(ctx: Context, actor: Actor, projectId: string): Skill[] {
  const rows = ctx.sqlite
    .prepare(
      'SELECT id,name,description,body,warnings,enabled,version,updatedAt FROM skills WHERE projectId=? ORDER BY name',
    )
    .all(projectId) as Row[];
  const human = actor.role === 'owner' || actor.role === 'operator';
  return rows.filter((r) => human || r.enabled === 1).map(view);
}

type ParsedSkill = ReturnType<typeof parseSkill>;

/** Inserts a new skill (disabled), or replaces the content of an existing one; changed content returns to disabled. */
function writeSkill(
  ctx: Context,
  actor: Actor,
  projectId: string,
  parsed: ParsedSkill,
  hash: string,
  existingId: string | undefined,
  now: number,
) {
  if (existingId)
    // Changed content never inherits the earlier approval: it returns to disabled.
    ctx.sqlite
      .prepare(
        'UPDATE skills SET description=?,body=?,warnings=?,contentHash=?,enabled=0,importedBy=?,version=version+1,updatedAt=? WHERE id=?',
      )
      .run(
        parsed.description,
        parsed.body,
        JSON.stringify(parsed.warnings),
        hash,
        actor.id,
        now,
        existingId,
      );
  else
    ctx.sqlite
      .prepare(
        'INSERT INTO skills(id,projectId,name,description,body,warnings,contentHash,enabled,importedBy,version,updatedAt) VALUES (?,?,?,?,?,?,?,0,?,1,?)',
      )
      .run(
        randomUUID(),
        projectId,
        parsed.name,
        parsed.description,
        parsed.body,
        JSON.stringify(parsed.warnings),
        hash,
        actor.id,
        now,
      );
}

function importSkill(
  ctx: Context,
  actor: Actor,
  c: Extract<Command, { type: 'skill.import' }>,
  now: number,
): Record<string, unknown> {
  let parsed;
  try {
    parsed = parseSkill(c.data.content);
  } catch (error) {
    if (error instanceof SkillError) throw new DomainError(error.code, 400);
    throw error;
  }
  const hash = createHash('sha256').update(c.data.content).digest('hex');
  const existing = ctx.sqlite
    .prepare('SELECT id,contentHash,version FROM skills WHERE projectId=? AND name=?')
    .get(c.projectId, parsed.name) as
    { id: string; contentHash: string; version: number } | undefined;
  if (existing?.contentHash === hash)
    return view(ctx.sqlite.prepare('SELECT * FROM skills WHERE id=?').get(existing.id) as Row);
  writeSkill(ctx, actor, c.projectId, parsed, hash, existing?.id, now);
  return view(
    ctx.sqlite
      .prepare('SELECT * FROM skills WHERE projectId=? AND name=?')
      .get(c.projectId, parsed.name) as Row,
  );
}

export function skillCommand(
  ctx: Context,
  actor: Actor,
  c: Extract<Command, { type: 'skill.import' | 'skill.toggle' }>,
): Record<string, unknown> {
  const now = ctx.now();
  if (c.type === 'skill.import') return importSkill(ctx, actor, c, now);
  const row = ctx.sqlite
    .prepare('SELECT * FROM skills WHERE id=? AND projectId=?')
    .get(c.data.skillId, c.projectId) as Row | undefined;
  if (!row) throw new DomainError('SKILL_NOT_FOUND', 404);
  assertVersion(row.version, c.expectedVersion);
  ctx.sqlite
    .prepare('UPDATE skills SET enabled=?,version=version+1,updatedAt=? WHERE id=?')
    .run(c.data.enabled ? 1 : 0, now, row.id);
  return view(ctx.sqlite.prepare('SELECT * FROM skills WHERE id=?').get(row.id) as Row);
}
