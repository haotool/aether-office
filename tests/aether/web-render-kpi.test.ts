import { afterAll, describe, expect, it, vi } from 'vitest';
import { installBrowserEnv, removeBrowserEnv } from './fixtures/browser-env.js';
import { QueryClient, h, renderHtml, textOf } from './fixtures/ssr.js';

installBrowserEnv();
vi.mock('../../apps/web/src/lib/preferences/phone.js', () => ({
  usePhone: () => false,
  usePhoneAny: () => false,
}));
const { translate } = await import('../../apps/web/src/lib/i18n/i18n.js');
const { ClaudeQuota, when } = await import('../../apps/web/src/features/kpi/ClaudeQuota.js');
const { KpiLimits } = await import('../../apps/web/src/features/kpi/KpiLimits.js');
const { Ring } = await import('../../apps/web/src/features/kpi/kpi-charts.js');
const { CountUp } = await import('../../apps/web/src/features/kpi/CountUp.js');
const { MessageActions } =
  await import('../../apps/web/src/features/conversation/MessageActions.js');
const { SeatToast } = await import('../../apps/web/src/features/office/SeatToast.js');
const { Ago, DaySeparator, NowProvider } =
  await import('../../apps/web/src/features/conversation/ConvTime.js');

afterAll(removeBrowserEnv);
const en = (key: Parameters<typeof translate>[1]) => translate('en', key);
const NOW = Date.UTC(2026, 9, 7, 12, 0, 0);
const DAY = 86_400_000;

describe('when', () => {
  it('writes day/month and a 24-hour clock in the zone asked for, Taipei by default', () => {
    expect(when(Date.UTC(2026, 9, 7, 16, 5, 0))).toBe('08/10, 00:05');
    expect(when(Date.UTC(2026, 9, 7, 16, 5, 0), 'UTC')).toBe('07/10, 16:05');
  });
});

describe('ClaudeQuota', () => {
  const limits = (over: Record<string, unknown> = {}) => ({
    plan: 'Max',
    fiveHour: { usedPercent: 42.4, resetsAt: NOW + 3_600_000 },
    sevenDay: { usedPercent: 10, resetsAt: null },
    updatedAt: NOW,
    stale: false,
    ...over,
  });
  const render = (value: unknown) => {
    const client = new QueryClient();
    if (value !== undefined) client.setQueryData(['claude-limits'], { limits: value });
    return renderHtml(h(ClaudeQuota), client);
  };

  it('shows a dash and says it is unknown before any reading', () => {
    const html = render(undefined);
    expect(textOf(html)).toContain('—');
    expect(html).toContain(`title="${en('claudeQuotaUnknown')}"`);
  });

  it('shows both windows and keeps the details for hover', () => {
    const html = render(limits());
    expect(textOf(html)).toContain('42·10%');
    expect(html).toContain('Max');
    expect(html).toContain(`${en('fiveHourWindow')} 42%`);
    expect(html).toContain(`${en('sevenDayWindow')} 10%`);
    expect(html).not.toContain('class="warn');
  });

  it('warns near the limit and marks old numbers stale', () => {
    const html = render(limits({ fiveHour: { usedPercent: 90, resetsAt: null }, stale: true }));
    expect(html).toContain('class="warn stale"');
    expect(html).toContain(en('quotaStale'));
  });

  it('shows a window it does not know as a dash', () => {
    expect(textOf(render(limits({ sevenDay: null })))).toContain('42·–%');
  });
});

describe('KpiLimits and Ring', () => {
  const claude = (over: Record<string, unknown> = {}) => ({
    plan: null,
    fiveHour: { usedPercent: 50, resetsAt: NOW + 2 * 3_600_000 },
    sevenDay: null,
    updatedAt: NOW - 60_000,
    stale: false,
    ...over,
  });
  const render = (limits: unknown) =>
    renderHtml(h(KpiLimits, { limits: limits as never, now: NOW, timeZone: 'UTC' }));

  it('draws a ring per known window with its reset and the age of the reading', () => {
    const html = render({ claude: claude() });
    expect(textOf(html)).toContain(`Claude · ${en('fiveHourWindow')}`);
    expect(textOf(html)).toContain(en('kpiResetsIn'));
    expect(textOf(html)).toContain(en('kpiReadAge'));
    expect(html).toContain('ring-ok');
    expect(textOf(html)).toContain(en('kpiCodexLimitsNone'));
    expect(textOf(html)).not.toContain(en('kpiClaudeLimitsNone'));
  });

  it('says so when there are no windows at all, for either provider', () => {
    const html = render({});
    expect(textOf(html)).toContain(en('kpiLimitsNone'));
    expect(textOf(html)).toContain(en('kpiClaudeLimitsNone'));
    expect(textOf(html)).toContain(en('kpiCodexLimitsNone'));
    expect(html).not.toContain('kpi-rings');
  });

  it('marks a reading stale when it says so or is older than fifteen minutes', () => {
    expect(render({ claude: claude({ stale: true }) })).toContain('class="stale"');
    expect(
      render({ claude: claude({ updatedAt: NOW - 16 * 60_000, stale: undefined }) }),
    ).toContain('class="stale"');
    expect(render({ claude: claude() })).not.toContain('class="stale"');
  });

  it('names a Codex window by its length and tones a ring by how full it is', () => {
    const html = render({
      codex: { windows: [{ minutes: 60, usedPercent: 100, resetsAt: null }], updatedAt: NOW },
    });
    expect(html).toContain('Codex · 1h');
    expect(html).toContain('ring-hot');
    expect(textOf(html)).toContain(en('kpiResetUnknown'));
    expect(renderHtml(h(Ring, { percent: 85 }))).toContain('ring-warn');
    expect(renderHtml(h(Ring, { percent: 130 }))).toContain('--used:100');
    expect(renderHtml(h(Ring, { percent: -5 }))).toContain('--used:0');
  });
});

describe('CountUp', () => {
  it('starts from zero and lets the animation take it to the value', () => {
    expect(textOf(renderHtml(h(CountUp, { value: 1500 })))).toBe('0');
  });

  it('formats with the formatter it was given', () => {
    expect(textOf(renderHtml(h(CountUp, { value: 5, format: (n: number) => `${n} tokens` })))).toBe(
      '0 tokens',
    );
  });
});

describe('MessageActions', () => {
  it('offers to copy the Markdown or the plain text, each with a name', () => {
    const html = renderHtml(h(MessageActions, { text: '**hi**' }));
    expect(html).toContain(`aria-label="${en('msgCopyMarkdown')}"`);
    expect(html).toContain(`aria-label="${en('msgCopyText')}"`);
    expect(html.match(/<button/g)).toHaveLength(2);
  });
});

describe('SeatToast', () => {
  it('says what happened and offers undo only while it can be taken back', () => {
    const plain = renderHtml(
      h(SeatToast, { toast: { text: 'Seat saved' } as never, onDismiss: () => undefined }),
    );
    expect(plain).toContain('role="status"');
    expect(textOf(plain)).toContain('Seat saved');
    expect(textOf(plain)).not.toContain(en('undo'));
    const undoable = renderHtml(
      h(SeatToast, {
        toast: { text: 'Moved', undo: () => undefined } as never,
        onDismiss: () => undefined,
      }),
    );
    expect(textOf(undoable)).toContain(en('undo'));
    expect(undoable).toContain(`aria-label="${en('close')}"`);
  });
});

describe('conversation times', () => {
  it('writes a machine-readable time and a full date as the tooltip', () => {
    const at = Date.now() - 120_000;
    const html = renderHtml(h(NowProvider, null, h(Ago, { at })));
    expect(html).toContain(`dateTime="${new Date(at).toISOString()}"`);
    expect(html).toContain('title="');
    expect(textOf(html)).toBe('2 min ago');
  });

  it('shows the clock for something older than an hour, and nothing for no time', () => {
    const old = renderHtml(h(Ago, { at: Date.now() - 3 * 3_600_000 }));
    expect(textOf(old)).toMatch(/\d{1,2}:\d{2}/);
    expect(renderHtml(h(Ago, { at: null }))).toBe('');
    expect(renderHtml(h(Ago, { at: 0 }))).toBe('');
  });

  it('labels the divider between days', () => {
    const label = (at: number) => textOf(renderHtml(h(DaySeparator, { at })));
    expect(label(Date.now())).toBe(en('dayToday'));
    expect(label(Date.now() - DAY)).toBe(en('dayYesterday'));
    expect(label(Date.now() - 10 * DAY)).not.toBe(en('dayToday'));
    expect(renderHtml(h(DaySeparator, { at: Date.now() }))).toContain('role="separator"');
  });

  it('gives its children the clock', () => {
    expect(textOf(renderHtml(h(NowProvider, null, h(DaySeparator, { at: Date.now() }))))).toBe(
      en('dayToday'),
    );
  });
});
