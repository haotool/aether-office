import { afterAll, beforeEach, describe, expect, it, vi } from 'vitest';
import type { PermissionRequestView } from '../../packages/contracts/src/index.js';
import { installBrowserEnv, removeBrowserEnv } from './fixtures/browser-env.js';
import { QueryClient, h, renderHtml, textOf } from './fixtures/ssr.js';

// First paint of presentational components on the server renderer (fixtures/ssr.ts): effects do not run, so each case is
// "these props, this markup". The phone hooks need a browser snapshot the server lacks and are replaced here.
installBrowserEnv();
vi.mock('../../apps/web/src/phone.js', () => ({ usePhone: () => false, usePhoneAny: () => false }));
const { translate } = await import('../../apps/web/src/i18n.js');
const { usePreferences } = await import('../../apps/web/src/state.js');
const { Avatar, avatarUrl } = await import('../../apps/web/src/features/Avatar.js');
const { PermissionCard, PermissionCards, PermissionPeek } =
  await import('../../apps/web/src/features/PermissionCard.js');
const { TerminalKeys } = await import('../../apps/web/src/features/TerminalKeys.js');
const { CodeBlock } = await import('../../apps/web/src/features/CodeBlock.js');
const { Inline } = await import('../../apps/web/src/features/MdInline.js');
const { LongText } = await import('../../apps/web/src/features/LongText.js');
const { HookNote, hookInstallCommand, needsHook } =
  await import('../../apps/web/src/features/HookNote.js');
const { NotFound } = await import('../../apps/web/src/features/NotFound.js');
const { ConnectionStatus } = await import('../../apps/web/src/features/ConnectionStatus.js');
const { ThinkingLine } = await import('../../apps/web/src/features/ThinkingLine.js');
const { recordMoment, withMoment, MOMENTS_PER_MEMBER } =
  await import('../../apps/web/src/features/life-moments.js');

afterAll(removeBrowserEnv);
const en = (key: Parameters<typeof translate>[1]) => translate('en', key);
beforeEach(() => usePreferences.setState({ locale: 'en' }));

describe('Avatar', () => {
  it('draws a labelled portrait as an image when it stands alone, and hides a decorative one', () => {
    const labelled = renderHtml(h(Avatar, { seed: 's', species: 'fox', label: 'Ada' }));
    expect(labelled).toContain('role="img"');
    expect(labelled).toContain('aria-label="Ada"');
    const decorative = renderHtml(h(Avatar, { seed: 's', species: 'fox' }));
    expect(decorative).toContain('aria-hidden="true"');
    expect(decorative).not.toContain('role="img"');
  });

  it('marks the size, the squad colour and a subagent’s tether', () => {
    const html = renderHtml(
      h(Avatar, { seed: 's', species: 'cat', size: 'chip', squadHue: 200, tether: true }),
    );
    expect(html).toContain('avatar-chip');
    expect(html).toContain('data-squad="200"');
    expect(html).toContain('avatar-tether');
    expect(renderHtml(h(Avatar, { seed: 's', species: 'cat' }))).not.toContain('avatar-tether');
  });

  it('draws one portrait per seed, species and state, once', () => {
    expect(avatarUrl('s', 'fox', 'idle')).toBe(avatarUrl('s', 'fox', 'idle'));
    expect(avatarUrl('s', 'fox', 'idle')).not.toBe(avatarUrl('s', 'fox', 'working'));
    expect(avatarUrl('s', 'fox', 'idle')).not.toBe(avatarUrl('t', 'fox', 'idle'));
    expect(avatarUrl('s', 'fox', 'idle')).toMatch(/^data:image\/svg\+xml;utf8,/);
  });
});

describe('PermissionCard', () => {
  const request = (over: Partial<PermissionRequestView> = {}): PermissionRequestView => ({
    id: 'r1',
    sessionKey: 'claude:s1',
    tool: 'Bash',
    summary: 'rm -rf build',
    preview: 'rm -rf build\nrm -rf dist',
    needsReview: false,
    sessionRules: ['Bash(rm:*)'],
    createdAt: Date.now() - 5_000,
    expiresAt: Date.now() + 55_000,
    state: 'pending',
    decidedAt: null,
    ...over,
  });

  it('shows what the tool wants to run, its preview, the session option and the three answers', () => {
    const html = renderHtml(h(PermissionCard, { request: request() }));
    const text = textOf(html);
    expect(text).toContain('Bash');
    expect(text).toContain('rm -rf build');
    expect(html).toContain('permission-preview');
    expect(text).toContain(en('reqAllowOnce'));
    expect(text).toContain(en('reqAllowSession'));
    expect(text).toContain(en('reqDeny'));
    expect(html).toContain(`placeholder="${en('reqReason')}"`);
  });

  it('offers no session option when Claude offered no rules, and no preview when there is none', () => {
    const html = renderHtml(
      h(PermissionCard, { request: request({ sessionRules: [], preview: null }) }),
    );
    expect(textOf(html)).not.toContain(en('reqAllowSession'));
    expect(html).not.toContain('permission-preview');
  });

  it('counts down to the moment Claude asks in the terminal, and says so when it has', () => {
    expect(textOf(renderHtml(h(PermissionCard, { request: request() })))).toMatch(
      new RegExp(`${en('reqCountdown')} (5[0-9])s`),
    );
    const expired = renderHtml(
      h(PermissionCard, { request: request({ expiresAt: Date.now() - 1 }) }),
    );
    expect(textOf(expired)).toContain(en('reqTerminal'));
    expect(expired).toContain('disabled');
  });

  it('keeps a compact card to one line and sends a call that line does not fully show to Review, not Allow', () => {
    const compact = renderHtml(
      h(PermissionCard, { request: request({ needsReview: false }), compact: true }),
    );
    expect(textOf(compact)).toContain(en('reqAllowOnce'));
    expect(compact).not.toContain('permission-preview');
    const hidden = renderHtml(
      h(PermissionCard, { request: request({ needsReview: true }), compact: true }),
    );
    expect(textOf(hidden)).toContain(en('reqReview'));
    expect(textOf(hidden)).not.toContain(en('reqAllowOnce'));
  });

  it('draws nothing for a session with no pending request, and the oldest first for one with several', () => {
    const client = new QueryClient();
    expect(renderHtml(h(PermissionCards, { sessionKey: 'claude:s1' }), client)).toBe('');
    client.setQueryData(
      ['permission-requests'],
      [
        request({ id: 'late', summary: 'second', createdAt: 2 }),
        request({ id: 'early', summary: 'first', createdAt: 1 }),
        request({ id: 'other', summary: 'elsewhere', sessionKey: 'claude:other' }),
        request({ id: 'done', summary: 'answered', state: 'allowed' as never }),
      ],
    );
    const text = textOf(
      renderHtml(h(PermissionCards, { sessionKey: 'claude:s1', compact: true }), client),
    );
    expect(text.indexOf('first')).toBeGreaterThan(-1);
    expect(text.indexOf('first')).toBeLessThan(text.indexOf('second'));
    expect(text).not.toContain('elsewhere');
    expect(text).not.toContain('answered');
  });

  it('peeks at the member’s own request first, otherwise the oldest of all', () => {
    const client = new QueryClient();
    client.setQueryData(
      ['permission-requests'],
      [
        request({ id: 'a', summary: 'newer', sessionKey: 'claude:x', createdAt: 9 }),
        request({ id: 'b', summary: 'older', sessionKey: 'claude:y', createdAt: 1 }),
      ],
    );
    expect(textOf(renderHtml(h(PermissionPeek, { sessionKey: 'claude:x' }), client))).toContain(
      'newer',
    );
    expect(textOf(renderHtml(h(PermissionPeek, {}), client))).toContain('older');
    expect(renderHtml(h(PermissionPeek, {}), new QueryClient())).toBe('');
  });
});

describe('TerminalKeys', () => {
  it('names the toolbar and labels each key for a screen reader', () => {
    const html = renderHtml(h(TerminalKeys, { onKey: () => undefined }));
    expect(html).toContain(`aria-label="${en('terminalKeys')}"`);
    for (const label of ['Esc', 'Tab', '^C', '^D', '↑', '↓', '←', '→', '⏎'])
      expect(html).toContain(`aria-label="${label}"`);
  });
});

describe('CodeBlock', () => {
  it('numbers the lines of a long block only, and keeps an empty line visible', () => {
    const short = renderHtml(h(CodeBlock, { text: 'a\n\nb', lang: 'ts' }));
    expect(short).not.toContain('numbered');
    expect(short.match(/code-line/g)).toHaveLength(3);
    const long = renderHtml(
      h(CodeBlock, {
        text: Array.from({ length: 12 }, (_, i) => `l${i}`).join('\n'),
        lang: undefined,
      }),
    );
    expect(long).toContain('numbered');
    expect(long).toContain('--digits:2');
  });

  it('colours a diff by line and shows the language', () => {
    const html = renderHtml(
      h(CodeBlock, { text: '--- a\n+++ b\n@@ -1 +1 @@\n-old\n+new', lang: 'diff' }),
    );
    expect(html).toContain('code-line add');
    expect(html).toContain('code-line del');
    expect(html).toContain('code-line ctx');
    expect(html).toContain('>diff<');
    expect(renderHtml(h(CodeBlock, { text: '+x', lang: 'ts' }))).not.toContain('code-line add');
  });

  it('offers wrapping and copying with accessible names', () => {
    const html = renderHtml(h(CodeBlock, { text: 'x', lang: 'ts' }));
    expect(html).toContain(`aria-label="${en('codeWrap')}"`);
    expect(textOf(html)).toContain(en('codeCopy'));
  });
});

describe('Inline', () => {
  const spans = [
    { text: 'plain ' },
    { text: 'bold', bold: true as const },
    { text: ' and ' },
    { text: 'code', code: true as const },
    { text: ' ' },
    { text: 'link', href: 'https://example.com/a?b=1&c=2', italic: true as const },
  ];

  it('nests styles as elements and opens a link in a new tab without leaking the opener', () => {
    const html = renderHtml(h(Inline, { spans, delay: null }));
    expect(html).toContain('<strong>bold</strong>');
    expect(html).toContain('<code>code</code>');
    expect(html).toContain('target="_blank"');
    expect(html).toContain('rel="noopener noreferrer"');
    expect(html).toContain('<em>link</em>');
    expect(html).not.toContain('class="w"');
  });

  it('fades words in one after another, but never the words of code', () => {
    const html = renderHtml(h(Inline, { spans, delay: 100 }));
    expect(html).toContain('animation-delay:100ms');
    expect(html).toContain('<code>code</code>');
    const two = renderHtml(h(Inline, { spans: [{ text: 'one two' }], delay: 100 }));
    expect([...two.matchAll(/animation-delay:(\d+)ms/g)].map((m) => m[1])).toEqual(['100', '114']);
  });

  it('stops growing the stagger after fifty words', () => {
    const html = renderHtml(
      h(Inline, { spans: [{ text: Array.from({ length: 80 }, () => 'w').join(' ') }], delay: 0 }),
    );
    const delays = [...html.matchAll(/animation-delay:(\d+)ms/g)].map((m) => Number(m[1]));
    expect(Math.max(...delays)).toBe(50 * 14);
  });
});

describe('LongText', () => {
  it('shows short or unfoldable content as it is, without a toggle', () => {
    const html = renderHtml(h(LongText, { foldable: true, children: 'hello' }));
    expect(html).toContain('hello');
    expect(html).not.toContain('long-toggle');
    expect(html).not.toContain('folded');
    expect(renderHtml(h(LongText, { foldable: false, children: 'x' }))).not.toContain(
      'long-toggle',
    );
  });
});

describe('HookNote', () => {
  const session = (over: Record<string, unknown> = {}) =>
    ({ provider: 'claude', hook: null, cwd: "/work/it's here", ...over }) as never;

  it('quotes a project path with an apostrophe so the copied command runs as typed', () => {
    expect(hookInstallCommand("/work/it's here")).toBe(
      "pnpm hooks install --project '/work/it'\\''s here'",
    );
    const html = renderHtml(h(HookNote, { session: session() }));
    expect(html).toContain(en('hookNoteTitle'));
    expect(html).toContain('pnpm hooks install --project');
  });

  it('is needed only by a working Claude session that reports no hook', () => {
    expect(needsHook(session(), true)).toBe(true);
    expect(needsHook(session(), false)).toBe(false);
    expect(needsHook(session({ provider: 'codex' }), true)).toBe(false);
    expect(needsHook(session({ hook: { lastEvent: 'Stop' } }), true)).toBe(false);
  });
});

describe('NotFound', () => {
  it('says the page is missing and links back', () => {
    const html = renderHtml(h(NotFound, { home: '/office' }));
    expect(textOf(html)).toContain(en('notFoundTitle'));
    expect(html).toContain('href="/office"');
    expect(textOf(html)).toContain(en('goHome'));
  });
});

describe('ConnectionStatus', () => {
  // The server renderer reads a store's initial state, so the link is at its first state: connecting.
  it('says connecting with a gold dot and how long ago the data was updated', () => {
    const html = renderHtml(h(ConnectionStatus, { updatedAt: Date.now() - 4_000, offline: false }));
    expect(html).toContain('dot gold');
    expect(textOf(html)).toContain(en('linkConnecting'));
    expect(textOf(html)).toMatch(/[34]s/);
    expect(html).toContain(`title="${en('linkLastUpdate')} `);
  });

  it('says offline in red whatever the stream says when the page is known offline', () => {
    const html = renderHtml(h(ConnectionStatus, { updatedAt: 0, offline: true }));
    expect(html).toContain('dot red');
    expect(textOf(html)).toContain(en('linkOffline'));
    expect(html).not.toContain('<small>');
    expect(html).toContain('title=""');
  });

  it('counts minutes for older data', () => {
    const html = renderHtml(
      h(ConnectionStatus, { updatedAt: Date.now() - 125_000, offline: false }),
    );
    expect(textOf(html)).toContain('2 min');
  });
});

describe('ThinkingLine', () => {
  it('counts from when the work began', () => {
    const html = renderHtml(h(ThinkingLine, { since: Date.now() - 75_000 }));
    expect(textOf(html)).toContain(en('convThinking'));
    expect(textOf(html)).toMatch(/1m ?1\ds|1:1\d|75s|1 ?m/);
  });
});

describe('life moments', () => {
  const moment = (member: string, n: number) =>
    ({ member, rule: `r${n}`, at: n, text: `t${n}` }) as never;

  it('keeps the newest few first', () => {
    let list: unknown[] = [];
    for (let i = 0; i < MOMENTS_PER_MEMBER + 3; i++)
      list = withMoment(list as never, moment('a', i));
    expect(list).toHaveLength(MOMENTS_PER_MEMBER);
    expect((list[0] as { at: number }).at).toBe(MOMENTS_PER_MEMBER + 2);
  });

  it('notifies listeners when the office shows a moment', () => {
    expect(() => recordMoment(moment('a', 1))).not.toThrow();
  });
});
