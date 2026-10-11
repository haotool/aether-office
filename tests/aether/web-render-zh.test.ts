import { afterAll, describe, expect, it, vi } from 'vitest';
import { installBrowserEnv, installGlobal, removeBrowserEnv } from './fixtures/browser-env.js';
import { QueryClient, h, renderHtml, textOf } from './fixtures/ssr.js';

installBrowserEnv();
installGlobal('navigator', { language: 'zh-TW', webdriver: false, onLine: true });
vi.mock('../../apps/web/src/lib/preferences/phone.js', () => ({
  usePhone: () => false,
  usePhoneAny: () => false,
}));
const { translate } = await import('../../apps/web/src/lib/i18n/i18n.js');
const { PermissionCard } = await import('../../apps/web/src/features/operations/PermissionCard.js');
const { TerminalKeys } = await import('../../apps/web/src/features/terminal/TerminalKeys.js');
const { NotFound } = await import('../../apps/web/src/features/shell-chrome/NotFound.js');

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
    expect(html).toContain('aria-label="Esc"');
  });

  it('says a page is missing in Chinese', () => {
    expect(textOf(renderHtml(h(NotFound, { home: '/' })))).toContain(
      translate('zh-TW', 'notFoundTitle'),
    );
  });
});
