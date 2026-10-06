import { describe, expect, it } from 'vitest';
import {
  balanceBrackets,
  cleanTitle,
  displayWidth,
  graphemes,
  shortLabel,
} from '../../packages/kernel/src/index.js';

// The title from the report: a 【 and a （ left open by a cut in the middle of a phrase.
const REPORTED = '【審查邊界（擁有者 10-05';
const REPORTED_FULL =
  '【審查邊界（擁有者 10-05, 程式碼審查, 離線）】 檢查 confirm-rate 的有效設定與回歸風險分析';
const OPENERS = ['(', '[', '{', '（', '［', '｛', '【', '「', '『', '《', '〈', '〔', '“'];

describe('displayWidth', () => {
  it.each([
    ['abc', 3],
    ['中文', 4],
    ['a中', 3],
    ['🚀', 2],
    ['👨‍👩‍👧‍👦', 2],
    ['é', 1],
    ['é', 1],
    ['ｱ', 1],
    ['Ａ', 2],
    ['한글', 4],
    ['', 0],
  ])('%s is %i columns', (text, width) => {
    expect(displayWidth(text)).toBe(width);
  });
});

describe('cleanTitle', () => {
  const CASES: [string, string, string][] = [
    ['plain', 'Fix login', 'Fix login'],
    ['span wrapper', '<span class="a">span title</span>', 'span title'],
    ['entities', 'Tom &amp; Jerry&nbsp;fix', 'Tom & Jerry fix'],
    ['markdown', '**bold** `code` [link](https://x.dev)', 'bold code link'],
    ['surrounding double quotes', '"quoted title"', 'quoted title'],
    ['surrounding curly quotes', '“quoted title”', 'quoted title'],
    ['surrounding backticks', '`title`', 'title'],
    ['single opening quote stays', "'tis the season", "'tis the season"],
    ['bullet', '- 🔹 bullet title', 'bullet title'],
    ['heading marker', '## Title', 'Title'],
    ['numbered', '1. First step', 'First step'],
    ['control characters', 'a\u0000b\u0007c', 'abc'],
    ['zero-width and bidi', 'a​b‮c⁦d﻿e', 'abcde'],
    ['stray joiner', 'a‍b', 'ab'],
    ['whitespace', '  a \n\t b   c ', 'a b c'],
    ['multi-line', 'first line\nsecond line', 'first line second line'],
    ['reported, unbalanced', REPORTED, '【審查邊界】'],
    ['dangling parenthesis', 'Fix (the login flow when', 'Fix'],
    ['dangling quote bracket', 'Review 「the spec', 'Review'],
    ['stray CJK closer', '審查）邊界', '審查邊界'],
    ['balanced stays', 'Fix 【login】 (now)', 'Fix 【login】 (now)'],
    ['ascii list marker kept', 'step a) then b)', 'step a) then b)'],
    ['empty', '', ''],
    ['only an opener', '【', ''],
  ];
  it.each(CASES)('%s', (_name, input, expected) => {
    expect(cleanTitle(input)).toBe(expected);
  });

  it('keeps a ZWJ emoji sequence whole', () => {
    expect(cleanTitle('👨‍👩‍👧‍👦 family')).toBe('👨‍👩‍👧‍👦 family');
  });

  it('cuts a very long title at about 120 characters on a boundary, never inside an emoji', () => {
    const long = `${'word '.repeat(40)}👨‍👩‍👧‍👦`.repeat(2);
    const out = cleanTitle(long);
    expect(graphemes(out).length).toBeLessThanOrEqual(120);
    expect(out.endsWith('…')).toBe(true);
    expect(out).not.toMatch(/‍…$/);
  });
});

describe('shortLabel', () => {
  const label = (t: string, o = {}) => shortLabel(t, { maxWidth: 28, ...o });

  it('closes or drops the bracket the report left open', () => {
    expect(label(REPORTED)).toBe('【審查邊界】');
  });

  it('cuts the full reported title on a boundary with brackets balanced', () => {
    const out = label(REPORTED_FULL);
    expect(out).toBe('【審查邊界】…');
    expect(displayWidth(out)).toBeLessThanOrEqual(28);
  });

  it('drops the id prefix', () => {
    expect(label('cx·01a1 Fix the login')).toBe('Fix the login');
    expect(label('cl·88ac w1119')).toBe('w1119');
  });

  it('drops a leading repo name when something follows it', () => {
    expect(label('confirm-rate: fix the gate', { repo: 'confirm-rate' })).toBe('fix the gate');
    expect(label('Confirm-Rate review', { repo: 'confirm-rate' })).toBe('review');
    expect(label('confirm-rate', { repo: 'confirm-rate' })).toBe('confirm-rate');
    expect(label('confirm-rates plan', { repo: 'confirm-rate' })).toBe('confirm-rates plan');
  });

  it('cuts English on a space', () => {
    expect(label('Fix the login flow when the session cookie expires in production')).toBe(
      'Fix the login flow when the…',
    );
  });

  it('cuts Chinese on a clause', () => {
    expect(label('修正登入流程。接著處理逾時問題並補上測試，最後更新文件與範例')).toBe(
      '修正登入流程。…',
    );
  });

  it('cuts CJK with no punctuation on a character boundary within the width', () => {
    const out = label('這是一個沒有任何標點符號而且非常非常長的標題用來測試截斷行為');
    expect(displayWidth(out)).toBeLessThanOrEqual(28);
    expect(out.endsWith('…')).toBe(true);
  });

  it('never cuts a Latin word in half when a space is available', () => {
    expect(label('internationalization of everything in the product')).toBe(
      'internationalization of…',
    );
  });

  it('cuts a single long Latin word at the width', () => {
    const out = label('a'.repeat(60));
    expect(displayWidth(out)).toBe(28);
    expect(out.endsWith('…')).toBe(true);
  });

  it('never cuts inside an emoji sequence', () => {
    const out = label(`👨‍👩‍👧‍👦${'👩‍💻'.repeat(30)}`);
    expect(displayWidth(out)).toBeLessThanOrEqual(28);
    for (const g of graphemes(out))
      expect(g === '…' || /\p{Extended_Pictographic}/u.test(g)).toBe(true);
  });

  it('prefers a cut outside brackets', () => {
    expect(label('Fix (login) and then deploy the whole thing now')).toBe(
      'Fix (login) and then deploy…',
    );
  });

  it('closes a bracket group that opens the label when a cut falls inside it', () => {
    expect(label('「the very long quoted phrase that goes on and on and on」 tail')).toBe(
      '「the very long quoted」…',
    );
  });

  it('honours a smaller width', () => {
    const out = shortLabel('Fix the login flow', { maxWidth: 10 });
    expect(displayWidth(out)).toBeLessThanOrEqual(10);
    expect(out).toBe('Fix the…');
  });

  it('keeps a title that fits unchanged', () => {
    expect(label('Fix login')).toBe('Fix login');
  });
});

describe('title properties', () => {
  const samples = [
    REPORTED,
    REPORTED_FULL,
    '<span class="x">【markup (inside</span>',
    '「「「nested openers',
    '（（（a）',
    'cx·01a1 ' + '很長的標題'.repeat(20),
    ...OPENERS.map((o) => `before ${o}after and more words that run on past the limit of the tag`),
    ...OPENERS.map((o) => `${o}${'x'.repeat(40)}`),
    'Ａ'.repeat(40),
    '🚀'.repeat(40),
    '👩‍💻 '.repeat(20),
    '- ## "quoted" title that goes on for a while and a while longer than needed',
    '`code` and **bold** and [links](https://x.dev) in one long title that is clearly too long',
    '&lt;div&gt; escaped &amp;amp; entity title that keeps going well beyond the width',
    'a​'.repeat(50),
    '',
    '   ',
    '---',
  ];

  it('is idempotent', () => {
    for (const s of samples) {
      expect(cleanTitle(cleanTitle(s)), s).toBe(cleanTitle(s));
      expect(shortLabel(shortLabel(s)), s).toBe(shortLabel(s));
      expect(shortLabel(shortLabel(s, { maxWidth: 12 }), { maxWidth: 12 }), s).toBe(
        shortLabel(s, { maxWidth: 12 }),
      );
    }
  });

  it('never exceeds the width', () => {
    for (const s of samples)
      for (const w of [6, 12, 20, 28])
        expect(displayWidth(shortLabel(s, { maxWidth: w })), `${w}: ${s}`).toBeLessThanOrEqual(w);
  });

  it('never ends with an opening bracket and every bracket is closed', () => {
    for (const s of samples)
      for (const out of [cleanTitle(s), shortLabel(s), shortLabel(s, { maxWidth: 10 })]) {
        const last = [...out.replace(/…$/, '')].at(-1) ?? '';
        expect(OPENERS.includes(last), `${s} -> ${out}`).toBe(false);
        expect(balanceBrackets(out), `${s} -> ${out}`).toBe(out);
      }
  });

  it('never holds markup or invisible characters', () => {
    for (const s of samples) {
      const out = shortLabel(s);
      expect(out).not.toMatch(/<\/?(span|div|b|i|a|p)\b/i);
      expect(out).not.toMatch(/[\u0000-\u001f​‮﻿]/u);
    }
  });
});

describe('balanceBrackets', () => {
  it.each([
    ['【a（b', '【a】'],
    ['a (b', 'a'],
    ['(', ''],
    ['（abc', '（abc）'],
    ['x」', 'x'],
    ['「a」「b', '「a」'],
    ['plain', 'plain'],
    ['(a) [b] {c}', '(a) [b] {c}'],
  ])('%s becomes %s', (input, expected) => {
    expect(balanceBrackets(input)).toBe(expected);
  });
});
