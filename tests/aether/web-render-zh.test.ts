import { afterAll, describe, expect, it, vi } from 'vitest';
import { installBrowserEnv, installGlobal, removeBrowserEnv } from './fixtures/browser-env.js';
import { QueryClient, h, renderHtml, textOf } from './fixtures/ssr.js';

// The server renderer reads a store's initial state, whose language is the browser's own: a Chinese browser, first visit.
installBrowserEnv();
installGlobal('navigator', { language: 'zh-TW', webdriver: false, onLine: true });
vi.mock('../../apps/web/src/phone.js', () => ({ usePhone: () => false, usePhoneAny: () => false }));
const { translate } = await import('../../apps/web/src/i18n.js');
const { PermissionCard } = await import('../../apps/web/src/features/PermissionCard.js');
const { TerminalKeys } = await import('../../apps/web/src/features/TerminalKeys.js');
const { NotFound } = await import('../../apps/web/src/features/NotFound.js');

afterAll(removeBrowserEnv);

describe('a browser whose language is Chinese', () => {
  it('shows the permission card in Chinese', () => {
    const request = {
      id: 'r1',
      sessionKey: 'claude:s1',
      tool: 'Bash',
      summary: 'ls',
      preview: null,
      needsReview: false,
      sessionRules: [],
      createdAt: Date.now(),
      expiresAt: Date.now() + 30_000,
      state: 'pending',
      decidedAt: null,
    };
    const text = textOf(
      renderHtml(h(PermissionCard, { request: request as never }), new QueryClient()),
    );
    expect(text).toContain(translate('zh-TW', 'reqAllowOnce'));
    expect(text).not.toContain(translate('en', 'reqAllowOnce'));
  });

  it('labels the phone terminal keys in Chinese', () => {
    const html = renderHtml(h(TerminalKeys, { onKey: () => undefined }));
    expect(html).toContain('aria-label="中斷 ^C"');
    expect(html).toContain('aria-label="Esc"'); // the same in both languages
  });

  it('says a page is missing in Chinese', () => {
    expect(textOf(renderHtml(h(NotFound, { home: '/' })))).toContain(
      translate('zh-TW', 'notFoundTitle'),
    );
  });
});
