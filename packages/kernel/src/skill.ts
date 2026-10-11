type ParsedSkill = {
  name: string;
  description: string;
  body: string;
  warnings: string[];
};

const MAX_BYTES = 64 * 1024;
const NAME = /^[a-z0-9][a-z0-9._-]{0,63}$/i;
const EXECUTABLE_KEYS = new Set([
  'allowed-tools',
  'hooks',
  'command',
  'commands',
  'shell',
  'run',
  'scripts',
]);
const SHELL_FENCE = /^```(?:bash|sh|zsh|shell|console|powershell|pwsh|cmd|bat)\b/im;

export class SkillError extends Error {
  constructor(
    readonly code:
      | 'SKILL_TOO_LARGE'
      | 'SKILL_FRONTMATTER_REQUIRED'
      | 'SKILL_NAME_INVALID'
      | 'SKILL_DESCRIPTION_REQUIRED',
  ) {
    super(code);
  }
}

const unquote = (v: string) => v.trim().replace(/^(['"])(.*)\1$/, '$2');

export function parseSkill(text: string): ParsedSkill {
  if (new TextEncoder().encode(text).length > MAX_BYTES) throw new SkillError('SKILL_TOO_LARGE');
  const match = /^---\r?\n([\s\S]*?)\r?\n---\r?\n?([\s\S]*)$/.exec(text);
  if (!match) throw new SkillError('SKILL_FRONTMATTER_REQUIRED');
  const fields = new Map<string, string>();
  const [, front = '', rest = ''] = match;
  for (const line of front.split(/\r?\n/)) {
    const kv = /^([A-Za-z][\w-]*):\s*(.*)$/.exec(line);
    if (kv) fields.set((kv[1] ?? '').toLowerCase(), unquote(kv[2] ?? ''));
  }
  const name = fields.get('name') ?? '';
  const description = fields.get('description') ?? '';
  if (!NAME.test(name)) throw new SkillError('SKILL_NAME_INVALID');
  if (!description) throw new SkillError('SKILL_DESCRIPTION_REQUIRED');
  const warnings: string[] = [];
  for (const key of fields.keys())
    if (EXECUTABLE_KEYS.has(key))
      warnings.push(`frontmatter "${key}" declares executable behaviour and is ignored`);
  if (SHELL_FENCE.test(rest))
    warnings.push('body contains shell snippets; they are displayed, never run');
  return { name, description, body: rest.trim(), warnings };
}
