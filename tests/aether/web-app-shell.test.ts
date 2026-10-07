import { afterAll, describe, expect, it, vi } from 'vitest';
import { installBrowserEnv, removeBrowserEnv } from './fixtures/browser-env.js';
import { QueryClient, h, renderHtml, textOf } from './fixtures/ssr.js';

// The whole app shell on the server renderer (fixtures/ssr.ts): nothing is signed in until the browser has asked the
// server, and effects do not run on the server, so what is checked is the page a visitor sees first. The two hooks that
// read the browser's media queries need a snapshot the server lacks and are replaced.
installBrowserEnv();
vi.mock('../../apps/web/src/phone.js', () => ({ usePhone: () => false, usePhoneAny: () => false }));
vi.mock('../../apps/web/src/theme.js', async (original) => ({
  ...(await original<typeof import('../../apps/web/src/theme.js')>()),
  useSystemDark: () => true,
}));
const { translate } = await import('../../apps/web/src/i18n.js');
const { App } = await import('../../apps/web/src/App.js');
const { Login } = await import('../../apps/web/src/features/Login.js');
const { RootBoundary } = await import('../../apps/web/src/RootBoundary.js');
const { Empty, PageHeading, Badge, whyNot } = await import('../../apps/web/src/ui.js');

afterAll(removeBrowserEnv);
const en = (key: Parameters<typeof translate>[1]) => translate('en', key);

describe('App before the browser knows who is signed in', () => {
  it('shows a loading screen instead of the sign-in form or the office', () => {
    const html = renderHtml(h(App), new QueryClient(), '/office');
    expect(html).toContain('boot-screen');
    expect(textOf(html)).toBe(en('loading'));
    expect(html).not.toContain('class="application"');
  });

  it('shows the same screen for any address, including one that is no page', () => {
    for (const path of ['/', '/sessions', '/settings/general', '/no-such-page'])
      expect(renderHtml(h(App), new QueryClient(), path)).toContain('boot-screen');
  });
});

describe('Login', () => {
  it('asks for the access token and offers to remember the device', () => {
    const html = renderHtml(h(Login, { onLogin: () => undefined }));
    expect(html).toContain('<form');
    expect(html).toContain('type="password"');
    expect(html).toContain('type="checkbox"');
    expect(html.match(/<button/g)!.length).toBeGreaterThan(0);
  });
});

describe('RootBoundary', () => {
  it('passes its children through when nothing went wrong', () => {
    const html = renderHtml(h(RootBoundary, null, h('p', null, 'fine')));
    expect(html).toBe('<p>fine</p>');
  });
});

describe('shared page pieces', () => {
  it('Empty says what is missing and how to go on', () => {
    const html = renderHtml(
      h(Empty, { title: 'Nothing here', hint: 'Start one', action: h('button', null, 'Go') }),
    );
    expect(textOf(html)).toBe('Nothing here Start one Go');
  });

  it('Empty leaves the hint out when there is none', () => {
    expect(textOf(renderHtml(h(Empty, { title: 'Nothing here' })))).toBe('Nothing here');
  });

  it('PageHeading names the page', () => {
    const html = renderHtml(h(PageHeading, { title: 'Sessions', subtitle: 'Running now' }));
    expect(html).toContain('<h1');
    expect(textOf(html)).toContain('Sessions');
    expect(textOf(html)).toContain('Running now');
  });

  it('Badge names a state in the page’s language, falling back to the raw state', () => {
    expect(renderHtml(h(Badge, { state: 'working' }))).toContain('state-working');
    expect(textOf(renderHtml(h(Badge, { state: 'working' })))).toBe(en('working'));
    expect(textOf(renderHtml(h(Badge, { state: 'zz-unknown' })))).toBe('zz-unknown');
  });

  it('whyNot explains a disabled control only while it is disabled', () => {
    expect(whyNot(true, 'because')).toEqual({});
    expect(whyNot(false, 'because')).toEqual({ title: 'because' });
  });
});
