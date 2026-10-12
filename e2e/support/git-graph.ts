import type { Page } from '@playwright/test';

const DAY_MS = 86_400_000;

export function syntheticGraph(count: number) {
  const commits = Array.from({ length: count }, (_, i) => ({
    sha: `${(count - i).toString(16).padStart(7, '0')}abc`,
    parents: i + 1 < count ? [`${(count - i - 1).toString(16).padStart(7, '0')}abc`] : [],
    refs: i === 0 ? ['main'] : [],
    subject: `Synthetic commit ${count - i}`,
    author: i % 3 === 0 ? 'Ada' : 'Lin',
    at: Date.now() - i * DAY_MS,
    lane: 0,
    edges:
      i + 1 < count
        ? [{ to: 0, parent: `${(count - i - 1).toString(16).padStart(7, '0')}abc` }]
        : [],
  }));
  return { commits, lanes: 1 };
}

export async function mockGitGraph(page: Page, count: number) {
  await page.route('**/api/projects/*/git-graph', (route) =>
    route.fulfill({ json: syntheticGraph(count) }),
  );
}
