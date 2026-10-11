import { expect, type Page } from '@playwright/test';
import { settled } from './settled.js';
import { execFileSync } from 'node:child_process';
import { mkdirSync, rmSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { signIn } from './sign-in.js';

export const home = process.env['AETHER_LOCAL_SESSIONS_HOME']!;
export const repo = join(home, 'fixture-seats');
export const folder = join(home, '.claude/projects/seats');
export const ids = [1, 2, 3].map((n) => `bbbbbbbb-0000-4000-8000-00000000000${n}`);
export const NAME = (n: number) => `Seat task ${n}`;

export function seedSeatSessions() {
  mkdirSync(repo, { recursive: true });
  execFileSync('git', ['init', '-q', repo]);
  mkdirSync(folder, { recursive: true });
  const at = (ago: number) => new Date(Date.now() - ago).toISOString();
  ids.forEach((id, i) => {
    const file = join(folder, `${id}.jsonl`);
    writeFileSync(
      file,
      [
        { type: 'ai-title', aiTitle: NAME(i + 1) },
        {
          type: 'user',
          cwd: repo,
          timestamp: at(60_000),
          message: { role: 'user', content: 'tidy it' },
        },
        {
          type: 'assistant',
          cwd: repo,
          timestamp: at(30_000),
          message: {
            role: 'assistant',
            model: 'claude-fixture-1',
            content: [{ type: 'text', text: 'Done.' }],
          },
        },
      ]
        .map((line) => JSON.stringify(line))
        .join('\n') + '\n',
    );
  });
}

export function removeSeatSessions() {
  rmSync(folder, { recursive: true, force: true });
}

export async function enter(
  page: Page,
  locale: 'zh-TW' | 'en' = 'en',
  project = 'fixture-seats',
  theme: 'dark' | 'light' = 'dark',
) {
  await page.addInitScript(
    ([l, th]) => {
      window.localStorage.setItem(
        'aether-ui-preferences',
        JSON.stringify({
          state: {
            advanced: true,
            locale: l,
            theme: th,
            quality: 'balanced',
            view: '3d',
            reducedMotion: false,
            autoCamera: false,
          },
          version: 0,
        }),
      );
    },
    [locale, theme] as const,
  );
  await signIn(page);
  const picker = page.locator('.project-picker select');
  await expect(picker.locator('option', { hasText: project })).toBeAttached({
    timeout: 20000,
  });
  await picker.selectOption({ label: project });
}

export async function bringIntoView(page: Page, n: number) {
  await page
    .locator('.feed-row', { hasText: NAME(n) })
    .first()
    .click();
  const tag = page.locator('button.scene-label.selected');
  await expect(tag).toBeVisible({ timeout: 15000 });
  await settled(tag);
  return tag;
}
export async function pretend(page: Page, liveness: Record<string, unknown>) {
  await page.route('**/api/local-sessions', async (route) => {
    const response = await route.fetch();
    const body = (await response.json()) as { sessions: Record<string, unknown>[] };
    for (const s of body.sessions) Object.assign(s, { process: 'running', liveness });
    await route.fulfill({ response, json: body });
  });
}
export const live = (page: Page) => page.locator('.char-layer [role="status"]').last();
