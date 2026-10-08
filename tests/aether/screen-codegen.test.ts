import { describe, expect, it } from 'vitest';
import {
  fallbackLanguage,
  languageOf,
  LANGUAGES,
  type LangId,
} from '../../packages/office-scene/src/screen/screen-lang.js';
import { generateFile, lineText } from '../../packages/office-scene/src/screen/screen-codegen.js';
import { seeded } from '../../packages/office-scene/src/environment/seeded.js';

const SAMPLE: Record<LangId, string> = {
  ts: 'session-store.ts',
  tsx: 'MemberScreen.tsx',
  js: 'build.mjs',
  py: 'train_model.py',
  go: 'server.go',
  rs: 'parser.rs',
  java: 'OrderService.java',
  css: 'tokens.css',
  md: 'README.md',
  json: 'package.json',
  yaml: 'ci.yml',
  sql: 'schema.sql',
  sh: 'deploy.sh',
};

describe('language of a real file', () => {
  it('comes from the extension only', () => {
    for (const [lang, file] of Object.entries(SAMPLE)) expect(languageOf(file)).toBe(lang);
    expect(languageOf('Makefile')).toBeNull();
    expect(languageOf(null)).toBeNull();
    expect(languageOf('archive.tar.zz')).toBeNull();
    expect(languageOf('UPPER.TS')).toBe('ts');
  });
});

describe('generated code', () => {
  it('is the same for the same seed and file, and differs across seeds and files', () => {
    const a = generateFile('member-1', 'app.ts', 'ts');
    expect(generateFile('member-1', 'app.ts', 'ts')).toEqual(a);
    expect(generateFile('member-2', 'app.ts', 'ts')).not.toEqual(a);
    expect(generateFile('member-1', 'other.ts', 'ts')).not.toEqual(a);
  });

  it('keeps brackets balanced and never closes more than it opened', () => {
    for (const lang of ['ts', 'tsx', 'js', 'go', 'rs', 'java', 'css'] as const)
      for (let s = 0; s < 20; s++) {
        let depth = 0;
        for (const line of generateFile(`seed-${s}`, SAMPLE[lang], lang)) {
          for (const [kind, text] of line.tokens)
            if (kind === 'pun') {
              depth += (text.match(/[{([]/g) ?? []).length;
              depth -= (text.match(/[})\]]/g) ?? []).length;
              expect(depth).toBeGreaterThanOrEqual(0);
            }
        }
        expect(depth, `${lang} seed-${s}`).toBe(0);
      }
  });

  it('indents python by one level at a time', () => {
    for (let s = 0; s < 20; s++) {
      let previous = 0;
      for (const line of generateFile(`seed-${s}`, 'job.py', 'py')) {
        if (line.tokens.length === 0) continue;
        expect(line.indent - previous).toBeLessThanOrEqual(1);
        previous = line.indent;
      }
    }
  });

  it('draws identifiers from the real file name', () => {
    const text = generateFile('member-1', 'invoice-totals.ts', 'ts').map(lineText).join('\n');
    expect(text.toLowerCase()).toContain('invoicetotals');
  });

  it('produces every language with plenty of non-empty lines, none absurdly wide', () => {
    for (const lang of LANGUAGES) {
      const lines = generateFile('member-1', SAMPLE[lang], lang);
      expect(lines.filter((l) => l.tokens.length > 0).length, lang).toBeGreaterThan(30);
      for (const line of lines) expect(lineText(line).length).toBeLessThan(90);
    }
  });

  it('shows a believable mix of languages for desks whose file is unknown, by role', () => {
    const mix = (role: string) => {
      const counts = new Map<string, number>();
      for (let s = 0; s < 200; s++) {
        const lang = fallbackLanguage(role, seeded(`seed-${s}`));
        counts.set(lang, (counts.get(lang) ?? 0) + 1);
      }
      return counts;
    };
    const frontend = mix('frontend');
    expect(frontend.get('tsx')!).toBeGreaterThan(60); // weight 5 of 10
    expect(frontend.get('py') ?? 0).toBe(0);
    expect(mix('ml').get('py')!).toBeGreaterThan(130);
    expect(new Set(mix('generalist').keys()).size).toBeGreaterThanOrEqual(4);
  });
});
