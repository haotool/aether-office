import { describe, expect, it } from 'vitest';
import { decodeCodeEntities, decodeEntities } from '../../packages/kernel/src/text-entities.js';
import { factsOf, isWrapper, tagSets } from '../../packages/kernel/src/text-tags.js';
import { htmlTable } from '../../packages/kernel/src/text-table.js';
import { TEMPLATES } from '../../packages/kernel/src/workflows.js';
import { ROLE_LABELS, type RoleId } from '../../packages/kernel/src/departments.js';
import {
  COMMANDS,
  PATHS,
  TOOLS,
  WORDS,
  roleOfSubagent,
} from '../../packages/kernel/src/role-signals.js';

describe('decodeEntities', () => {
  it('decodes named, decimal and hex references once', () => {
    expect(decodeEntities('a&nbsp;b &mdash; c &#8230; &#x2192; &copy;')).toBe('a b — c … → ©');
  });

  it('escapes what Markdown would act on, so a decoded reference is never syntax', () => {
    expect(decodeEntities('&lt;div&gt;')).toBe('\\<div>');
    expect(decodeEntities('&#96;x&#92;')).toBe('\\`x\\\\');
  });

  it('never decodes twice: an ampersand that starts another reference stays', () => {
    expect(decodeEntities('&amp;lt;')).toBe('&amp;lt;');
    expect(decodeEntities('fish &amp; chips')).toBe('fish & chips');
    expect(decodeEntities('&amp;#65;')).toBe('&amp;#65;');
  });

  it('leaves unknown names alone and drops controls, surrogates and out-of-range values', () => {
    expect(decodeEntities('&bogus; &#1; &#xD800; &#9999999;')).toBe('&bogus;   ' + '');
    expect(decodeEntities('a&#9;b&#10;c')).toBe('a b c');
  });

  it('decodes into plain characters inside code', () => {
    expect(decodeCodeEntities('&lt;T&gt; &amp;&amp; &#96;')).toBe('<T> && `');
  });
});

describe('tag classification', () => {
  const classify = (
    text: string,
    name: string,
    over: Partial<Parameters<typeof factsOf>[3]> = {},
  ) => {
    const from = text.indexOf(`<${over.closing ? '/' : ''}${name}`);
    const to = text.indexOf('>', from) + 1;
    const facts = factsOf(text, from, to, {
      closing: false,
      selfClosing: false,
      attrs: '',
      ...over,
    });
    return isWrapper(name.toLowerCase(), facts, tagSets(text));
  };

  it('collects what opens and closes in prose and skips code spans', () => {
    const sets = tagSets('<Note>hi</Note> and `<code-only>` and <br/> <x a="1">');
    expect([...sets.opens].sort()).toEqual(['note', 'x']);
    expect([...sets.closes]).toEqual(['note']);
    expect(tagSets('no tags here').opens.size).toBe(0);
  });

  it('treats a closing tag as a wrapper, balanced or stray', () => {
    expect(classify('text </stray> more', 'stray', { closing: true })).toBe(true);
  });

  it('treats a balanced pair as wrapper and a lone generic attached to an identifier as text', () => {
    expect(classify('<result>done</result>', 'result')).toBe(true);
    expect(classify('use Array<string> here', 'string')).toBe(false);
    expect(classify('a<b>c', 'b')).toBe(false);
  });

  it('treats a separated name alone on a line as a wrapper, but the same name mid-sentence as text', () => {
    expect(classify('<task-notification>\nbody', 'task-notification')).toBe(true);
    expect(classify('set <your-key> in the config please', 'your-key')).toBe(false);
    expect(classify('see <invoke name="x"> now', 'antml:invoke', { attrs: ' name="x"' })).toBe(
      true,
    );
  });

  it('keeps a plain unpaired word tag that is not separated', () => {
    expect(classify('<word>\nsome text', 'word')).toBe(false);
  });
});

describe('htmlTable', () => {
  const clean = (html: string) => html.replace(/<[^>]+>/g, '').trim();

  it('makes the first row the header and pads short rows', () => {
    const table = htmlTable(
      '<tr><th>Name</th><th>Role</th></tr><tr><td>Ada</td></tr><tr><td>Bo</td><td>QA</td></tr>',
      clean,
    );
    expect(table.trim().split('\n')).toEqual([
      '| Name | Role |',
      '| --- | --- |',
      '| Ada |  |',
      '| Bo | QA |',
    ]);
  });

  it('keeps a cell on one line with its pipes and backslashes escaped', () => {
    const table = htmlTable('<tr><td>a|b\\|\n  c</td></tr>', clean);
    expect(table).toContain('| a\\|b\\\\\\| c |');
  });

  it('copes with unclosed rows and cells', () => {
    const table = htmlTable('<tr><td>1<td>2<tr><td>3<td>4', clean);
    expect(table.trim().split('\n').at(-1)).toBe('| 3 | 4 |');
  });

  it('returns the cell text when there is no row to tabulate', () => {
    expect(htmlTable('just <b>text</b>', clean).trim()).toMatch(/^just\s+text$/);
  });
});

describe('workflow templates', () => {
  it('only depend on earlier steps, so each plan is a DAG', () => {
    for (const [name, steps] of Object.entries(TEMPLATES))
      steps.forEach((step, index) => {
        expect(
          step.dependsOn.every((d) => d >= 0 && d < index),
          name,
        ).toBe(true);
      });
  });

  it('pair the two providers of a cross-review so nobody reviews their own work', () => {
    for (const steps of [TEMPLATES.claude_codex_review, TEMPLATES.codex_claude_review]) {
      expect(steps).toHaveLength(1);
      expect(steps[0]!.engineerProvider).toBeDefined();
      expect(steps[0]!.reviewerProvider).not.toBe(steps[0]!.engineerProvider);
    }
  });

  it('join the frontend and backend parts in an integration step that waits for both', () => {
    const roles = TEMPLATES.frontend_backend.map((s) => s.role);
    expect(roles).toEqual(['frontend', 'backend', 'integration']);
    expect(TEMPLATES.frontend_backend[2]!.dependsOn).toEqual([0, 1]);
  });

  it('chain research to verification one step at a time, each with an acceptance note', () => {
    const steps = TEMPLATES.research_design_impl;
    expect(steps.map((s) => s.dependsOn)).toEqual([[], [0], [1], [2]]);
    expect(steps.every((s) => s.acceptanceNote.length > 20)).toBe(true);
  });
});

describe('role signal vocabulary', () => {
  const known = (role: RoleId) => expect(Object.keys(ROLE_LABELS)).toContain(role);

  it('points every rule at a role that exists, with a positive strength', () => {
    for (const [role, strength] of WORDS) {
      known(role);
      expect([1, 2]).toContain(strength);
    }
    const weighted = [
      ...PATHS.map(([role, weight, , label]) => ({ role, weight, label })),
      ...COMMANDS.map(([role, weight, , label]) => ({ role, weight, label })),
      ...TOOLS.map(([, role, weight, label]) => ({ role, weight, label })),
    ];
    for (const { role, weight, label } of weighted) {
      known(role);
      expect(weight).toBeGreaterThan(0);
      expect(label.length).toBeGreaterThan(0);
    }
  });

  it('matches words whole in Latin and as substrings in Chinese', () => {
    const frontend = WORDS.find(([role, s]) => role === 'frontend' && s === 2)![2];
    expect(frontend.test('fix the react component')).toBe(true);
    expect(frontend.test('make the 畫面 wider')).toBe(true);
    expect(frontend.test('constructive feedback')).toBe(false);
  });

  it('recognises test files wherever they live', () => {
    const qa = PATHS.find(([role]) => role === 'qa')![2];
    for (const file of [
      'tests/a.ts',
      'src/a.test.tsx',
      'pkg/__tests__/x.js',
      'a_test.go',
      'test_a.py',
    ])
      expect(qa.test(file), file).toBe(true);
    expect(qa.test('src/latest.ts')).toBe(false);
  });

  it('recognises release commands', () => {
    const release = COMMANDS.find(([role]) => role === 'release')![2];
    expect(release.test('git tag v1.2.0')).toBe(true);
    expect(release.test('git status')).toBe(false);
  });

  it('maps subagent types to a role, in order, and says nothing for an unknown type', () => {
    expect(roleOfSubagent('security-reviewer')).toBe('security');
    expect(roleOfSubagent('code-reviewer')).toBe('review');
    expect(roleOfSubagent('tdd-guide')).toBe('qa');
    expect(roleOfSubagent('Explore')).toBe('research');
    expect(roleOfSubagent('general-purpose')).toBeNull();
  });

  it('reads tool names that say something by themselves', () => {
    const role = (tool: string) => TOOLS.find(([pattern]) => pattern.test(tool))?.[1];
    expect(role('ExitPlanMode')).toBe('architect');
    expect(role('mcp__plugin_design_figma__get_design')).toBe('frontend');
    expect(role('mcp__sentry__issues')).toBe('sre');
    expect(role('Read')).toBeUndefined();
  });
});
