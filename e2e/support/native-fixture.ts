import { mkdirSync, readFileSync, realpathSync, utimesSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { randomUUID } from 'node:crypto';
import { expect, type Locator, type Page } from '@playwright/test';
import { NATIVE_SESSION, nativeOrigin } from './sign-in.js';

export const NATIVE_RESUMABLE_SESSION_ID = '11111111-2222-4333-8444-555555555555';

export const NATIVE_TRANSCRIPT_KEEPALIVE_MS = 3_600_000;

export function nativeDataDirectory() {
  return (JSON.parse(readFileSync(NATIVE_SESSION, 'utf8')) as { directory: string }).directory;
}

export function nativeSessionsHome() {
  return join(nativeDataDirectory(), 'home');
}

export function nativeFixtureRepository() {
  return join(nativeDataDirectory(), 'fixture-repository');
}

function claudeProjectFolder(home: string, repo: string) {
  return join(home, '.claude/projects', realpathSync(repo).replace(/[^A-Za-z0-9]/g, '-'));
}

export function touchTranscriptKeepalive(transcriptPath: string) {
  const at = new Date(Date.now() + NATIVE_TRANSCRIPT_KEEPALIVE_MS);
  utimesSync(transcriptPath, at, at);
}

export function writeNativeTerminalTranscript(options: {
  sessionId?: string;
  answerText: string;
  userText?: string;
}) {
  const home = nativeSessionsHome();
  const repo = nativeFixtureRepository();
  const folder = claudeProjectFolder(home, repo);
  mkdirSync(folder, { recursive: true });
  const sessionId = options.sessionId ?? randomUUID();
  const transcriptPath = join(folder, `${sessionId}.jsonl`);
  const at = (offsetMs: number) => new Date(Date.now() - offsetMs).toISOString();
  writeFileSync(
    transcriptPath,
    [
      { type: 'user', cwd: realpathSync(repo) },
      {
        type: 'user',
        timestamp: at(30_000),
        message: { role: 'user', content: options.userText ?? 'Earlier question from a terminal' },
      },
      {
        type: 'assistant',
        timestamp: at(20_000),
        message: {
          role: 'assistant',
          model: 'claude-fixture-1',
          content: [{ type: 'text', text: options.answerText }],
        },
      },
    ]
      .map((entry) => JSON.stringify(entry))
      .join('\n') + '\n',
  );
  touchTranscriptKeepalive(transcriptPath);
  return sessionId;
}

export function nativeSessionAgentId(sessionId: string) {
  return `local:claude:${sessionId}`;
}

export function nativeFeedRow(scope: Locator, sessionId: string) {
  return scope.locator(`.feed-row[data-agent="${nativeSessionAgentId(sessionId)}"]`);
}

export async function syntheticBrowserProjectId(page: Page) {
  const projects = (await (await page.request.get(`${nativeOrigin()}/api/projects`)).json()) as {
    id: string;
    name: string;
  }[];
  return projects.find((p) => p.name.startsWith('Synthetic browser fixture'))!.id;
}

export async function openNativeSessionRow(
  page: Page,
  sessionId: string,
  phone: boolean,
): Promise<Locator> {
  const projectId = await syntheticBrowserProjectId(page);
  await page.goto(`${nativeOrigin()}/office?project=${projectId}`);
  if (phone) {
    await page.getByRole('button', { name: '開啟 session 列表' }).tap();
    const row = nativeFeedRow(page.locator('.session-sheet.half'), sessionId);
    await expect(row).toBeVisible({ timeout: 45_000 });
    await row.tap();
    return page.locator('.session-sheet.full');
  }
  const panel = page.locator('.session-panel');
  if (page.viewportSize()!.width <= 1000)
    await page.getByRole('button', { name: '即時 session' }).click();
  const row = nativeFeedRow(panel, sessionId);
  await expect(row).toBeVisible({ timeout: 45_000 });
  await row.click();
  return panel;
}

export async function continueNativeSessionIfNeeded(scope: Locator) {
  const resume = scope.getByRole('button', { name: '在 AETHER 繼續', exact: true });
  const composer = scope.getByLabel('傳訊息給 session');
  await expect(resume.or(composer)).toBeVisible({ timeout: 20_000 });
  if (await resume.isVisible()) await resume.click({ timeout: 3000 }).catch(() => undefined);
  await expect(composer).toBeVisible({ timeout: 45_000 });
}
