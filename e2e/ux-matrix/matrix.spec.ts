import { test, type Page } from '@playwright/test';
import {
  openContext,
  record,
  signedInPage,
  watchErrors,
  writeIndex,
  type Cell,
  type Tag,
} from './ux.js';

const PAGES = [
  'office',
  'agents',
  'tasks',
  'messages',
  'workspace',
  'terminals',
  'sessions',
  'observations',
  'reviews',
  'approvals',
  'knowledge',
  'machines',
  'history',
  'settings',
] as const;
const WIDTHS = [
  [320, 568],
  [360, 640],
  [390, 844],
  [820, 1180],
  [1180, 820],
  [1440, 900],
  [1920, 1080],
] as const;
const THEMES = ['light', 'dark'] as const;
const LANGS = ['en', 'zh-TW'] as const;
const ONLY = process.env['UX_ONLY'];

type Shot = (scene: string) => Promise<Cell>;

async function signedOutCells(page: Page, shot: Shot) {
  await page.goto('/');
  const login = await shot('login');
  await page.goto('/no-such-page');
  return [login, await shot('login-404')];
}

async function officeListCells(page: Page, project: string, shot: Shot) {
  await page.goto(`/office?project=${project}`);
  await page.getByRole('button', { name: /^2D/ }).first().click();
  const top = await shot('office-2d');
  await page.locator('.office-2d').evaluate((el) => el.scrollTo(0, el.scrollHeight));
  return [top, await shot('office-2d-end')];
}

async function firstProject(page: Page) {
  const projects = (await (await page.request.get('/api/projects')).json()) as { id: string }[];
  const first = projects[0];
  if (!first) throw new Error('the e2e server has no project');
  return first.id;
}

for (const [w, h] of WIDTHS)
  for (const theme of THEMES)
    for (const lang of LANGS) {
      if (ONLY && ONLY !== `${w}x${h}`) continue;
      test(`${w}x${h} ${theme} ${lang}`, async ({ browser }) => {
        const tag: Tag = { w, h, theme, lang };
        const context = await openContext(browser, tag);
        const page = await context.newPage();
        const errors: string[] = [];
        watchErrors(page, errors);
        const shot: Shot = (scene) => record(page, scene, tag, errors);
        const cells = await signedOutCells(page, shot);
        const signedIn = await signedInPage(context);
        await page.close();
        const project = await firstProject(signedIn);
        errors.length = 0;
        watchErrors(signedIn, errors);
        const inSession: Shot = (scene) => record(signedIn, scene, tag, errors);
        for (const name of PAGES) {
          await signedIn.goto(`/${name}?project=${project}`);
          cells.push(await inSession(name));
        }
        cells.push(...(await officeListCells(signedIn, project, inSession)));
        await signedIn.goto(`/not-a-page?project=${project}`);
        cells.push(await inSession('not-found'));
        writeIndex(`${w}x${h}-${theme}-${lang}`, cells);
        await context.close();
      });
    }
