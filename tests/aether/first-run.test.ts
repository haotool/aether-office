import { describe, expect, it } from 'vitest';
import type { Agent } from '../../packages/contracts/src/index.js';
import { fill, resolveLocale } from '../../apps/web/src/i18n.js';
import { documentTitle } from '../../apps/web/src/app-hooks.js';
import { isPage } from '../../apps/web/src/nav.js';
import { sceneSummary } from '../../apps/web/src/features/scene-summary.js';

describe('first-run language', () => {
  it('follows the browser: Chinese gets Traditional Chinese, everything else English', () => {
    for (const language of ['zh', 'zh-TW', 'zh-CN', 'zh-Hant-HK', 'ZH-tw'])
      expect(resolveLocale(language), language).toBe('zh-TW');
    for (const language of ['en-US', 'en', 'fr-FR', 'ja', '', undefined])
      expect(resolveLocale(language), String(language)).toBe('en');
  });

  it('fills numbered placeholders', () => {
    expect(fill('{1} of {0}', 3, 'x')).toBe('x of 3');
  });
});

describe('tab title', () => {
  it('names the page, then the product, with the count of things waiting first', () => {
    expect(documentTitle('Approvals', 0)).toBe('Approvals · AETHER OFFICE');
    expect(documentTitle('核准', 2)).toBe('(2) 核准 · AETHER OFFICE');
    expect(documentTitle('', 0)).toBe('AETHER OFFICE');
  });
});

describe('addresses', () => {
  it('knows the pages of the app and nothing else', () => {
    expect(isPage('office')).toBe(true);
    expect(isPage('settings')).toBe(true);
    expect(isPage('nonexistent-page')).toBe(false);
  });
});

describe('scene summary', () => {
  const agent = (id: string, activity: Agent['activity']) => ({ id, activity }) as Agent;
  const agents = [agent('a', 'working'), agent('b', 'working'), agent('c', 'waiting_permission')];
  const floorOf = (a: Agent) => (a.id === 'c' ? 1 : 0);

  it('counts characters, floors, working and waiting, in both languages', () => {
    expect(sceneSummary(agents, floorOf, 'en')).toBe(
      '3 characters on 2 floors: 2 working, 1 waiting for you',
    );
    expect(sceneSummary(agents, floorOf, 'zh-TW')).toBe(
      '2 層樓共 3 個角色：2 個工作中，1 個等你處理',
    );
  });

  it('says so when the office is empty', () => {
    expect(sceneSummary([], floorOf, 'en')).toMatch(/No characters/);
  });
});
