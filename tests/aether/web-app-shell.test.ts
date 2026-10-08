import { afterAll, describe, expect, it, vi } from 'vitest';
import { installBrowserEnv, removeBrowserEnv } from './fixtures/browser-env.js';
import { QueryClient, h, renderHtml, textOf } from './fixtures/ssr.js';

// The whole app shell on the server renderer (fixtures/ssr.ts): nothing is signed in until the browser has asked the
// server, and effects do not run on the server, so what is checked is the page a visitor sees first. The two hooks that
// read the browser's media queries need a snapshot the server lacks and are replaced.
installBrowserEnv();
vi.mock('../../apps/web/src/lib/preferences/phone.js', () => ({
  usePhone: () => false,
  usePhoneAny: () => false,
}));
vi.mock('../../apps/web/src/lib/preferences/theme.js', async (original) => ({
  ...(await original<typeof import('../../apps/web/src/lib/preferences/theme.js')>()),
  useSystemDark: () => true,
}));
const { translate } = await import('../../apps/web/src/lib/i18n/i18n.js');
const { App } = await import('../../apps/web/src/App.js');
const { Login } = await import('../../apps/web/src/features/shell-chrome/Login.js');
const { RootBoundary } = await import('../../apps/web/src/RootBoundary.js');
const { Empty } = await import('../../apps/web/src/ui/Empty.js');
const { PageHeading } = await import('../../apps/web/src/ui/PageHeading.js');
const { Badge } = await import('../../apps/web/src/ui/Badge.js');
const { whyNot, REASONS, reasonId } = await import('../../apps/web/src/ui/whyNot.js');
const { ReasonDefs } = await import('../../apps/web/src/ui/ReasonDefs.js');

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

  it('whyNot explains a control only while a need is unmet, with the first unmet need', () => {
    expect(whyNot(en, [true, 'needOwner'], [true, 'whyBusy'])).toEqual({});
    expect(whyNot(en)).toEqual({});
    expect(whyNot(en, [true, 'needOwner'], [false, 'whyBusy'], [false, 'whyNoText'])).toEqual({
      title: en('whyBusy'),
      'aria-describedby': 'why-whyBusy',
    });
  });

  it('ReasonDefs renders every reason once under the id whyNot points at', () => {
    const html = renderHtml(h(ReasonDefs));
    for (const reason of REASONS) {
      expect(html).toContain(`id="${reasonId(reason)}"`);
      expect(textOf(html)).toContain(en(reason));
    }
  });
});
