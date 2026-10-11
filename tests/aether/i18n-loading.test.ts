import { describe, expect, it, vi } from 'vitest';
import { en } from '../../apps/web/src/locales/en.js';
import { zh } from '../../apps/web/src/locales/zh.js';

const fresh = async () => {
  vi.resetModules();
  return import('../../apps/web/src/lib/i18n/i18n.js');
};

describe('lazy language tables', () => {
  it('shows the key until a table is loaded, then the text', async () => {
    const i18n = await fresh();
    expect(i18n.hasLocale('zh-TW')).toBe(false);
    expect(i18n.translate('zh-TW', 'loading')).toBe('loading');
    await i18n.loadLocale('zh-TW');
    expect(i18n.hasLocale('zh-TW')).toBe(true);
    expect(i18n.hasLocale('en')).toBe(false);
    expect(i18n.translate('zh-TW', 'loading')).toBe(zh.loading);
  });

  it('falls back to a loaded language while the asked one is missing', async () => {
    const i18n = await fresh();
    await i18n.loadLocale('en');
    expect(i18n.translate('zh-TW', 'loading')).toBe(en.loading);
  });
});
