import { expect, it } from 'vitest';
import { nav, tabPages, visibleGroups, visibleNav } from '../../apps/web/src/nav.js';

const keys = (list: readonly (readonly [string, ...unknown[]])[]) => list.map(([key]) => key);

it('shows the CLI-first pages only until Advanced is on, and everything with it', () => {
  expect(keys(visibleNav(true))).toEqual(keys(nav));
  expect(keys(visibleNav(false))).toEqual([
    'office',
    'terminals',
    'sessions',
    'approvals',
    'history',
    'settings',
  ]);
});

it('every page stays in exactly one group, and a group left empty is dropped', () => {
  const all = visibleGroups(true).flatMap(([, pages]) => pages);
  expect([...all].sort()).toEqual(keys(nav).sort());
  expect(visibleGroups(false).every(([, pages]) => pages.length > 0)).toBe(true);
  expect(visibleGroups(false).flatMap(([, pages]) => pages)).toEqual([
    'office',
    'approvals',
    'sessions',
    'terminals',
    'history',
    'settings',
  ]);
});

it('keeps the phone tab bar to four pages that exist in the current mode', () => {
  for (const advanced of [true, false]) {
    const shown = keys(visibleNav(advanced));
    expect(tabPages(advanced)).toHaveLength(4);
    for (const page of tabPages(advanced)) expect(shown).toContain(page);
  }
});
