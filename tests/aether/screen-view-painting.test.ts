import { describe, expect, it } from 'vitest';
import {
  drawChat,
  drawDesign,
  drawNotebook,
} from '../../packages/office-scene/src/screen/screen-view-collab.js';
import { drawEditor } from '../../packages/office-scene/src/screen/screen-view-editor.js';
import {
  drawDashboard,
  drawGitDiff,
  drawGitGraph,
  drawTests,
} from '../../packages/office-scene/src/screen/screen-view-ops.js';
import { drawLock } from '../../packages/office-scene/src/screen/screen-view-overlay.js';
import { drawTerminal } from '../../packages/office-scene/src/screen/screen-view-terminal.js';
import { drawBrowser, drawDocs } from '../../packages/office-scene/src/screen/screen-view-web.js';
import { PALETTES } from '../../packages/office-scene/src/screen/screen-theme.js';
import { VIEWS } from '../../packages/office-scene/src/screen/screen-views.js';
import { numbersOf, textsOf } from './fixtures/recording-canvas.js';
import {
  ALL_VIEWS,
  facts,
  paint,
  profile,
  registerDeskScreenHooks,
} from './screen-view-desk-fixtures.js';

// Desk screens: each view paints from the facts of a real session onto a recording canvas (fixtures/recording-canvas.ts).
// The text it shows must be the session's own words; the picture around them is made up and must at least be complete,
// repeatable and inside the screen.
registerDeskScreenHooks();

describe('every view', () => {
  it('is one of the twelve a desk can show', () => {
    expect(ALL_VIEWS.sort()).toEqual([
      'browser',
      'chat',
      'dashboard',
      'design',
      'docs',
      'editor',
      'git-diff',
      'git-graph',
      'lock',
      'notebook',
      'terminal',
      'tests',
    ]);
    const direct = [
      drawChat,
      drawDesign,
      drawNotebook,
      drawEditor,
      drawDashboard,
      drawGitDiff,
      drawGitGraph,
      drawTests,
      drawLock,
      drawTerminal,
      drawBrowser,
      drawDocs,
    ];
    expect(Object.values(VIEWS)).toEqual(expect.arrayContaining(direct));
  });

  it.each(ALL_VIEWS)(
    '%s paints a complete picture with real numbers, in both themes, moving or still',
    (view) => {
      for (const theme of ['dark', 'light'] as const)
        for (const moving of [true, false]) {
          const calls = paint(view, { p: PALETTES[theme], profile: profile({ theme }), moving });
          expect(calls.length, `${theme} ${moving}`).toBeGreaterThan(8);
          expect(numbersOf(calls).every(Number.isFinite), `${theme} ${moving}`).toBe(true);
        }
    },
  );

  it.each(ALL_VIEWS)('%s paints the same picture twice for the same moment', (view) => {
    expect(paint(view)).toEqual(paint(view));
  });

  it.each(ALL_VIEWS)('%s differs between members', (view) => {
    expect(paint(view, { seed: 'member-1' })).not.toEqual(paint(view, { seed: 'member-2' }));
  });

  it.each(ALL_VIEWS)('%s survives a session with nothing known', (view) => {
    const bare = facts({
      title: null,
      branch: null,
      model: null,
      contextPercent: null,
      state: 'unknown',
      tool: null,
      toolSince: null,
      recent: [],
      quietMinutes: null,
      ports: [],
    });
    const calls = paint(view, { facts: bare });
    expect(numbersOf(calls).every(Number.isFinite)).toBe(true);
  });
});

describe('what the views say in words', () => {
  it('shows the real file name in the editor', () => {
    const words = textsOf(
      paint('editor', {
        facts: facts({ tool: 'Edit', recent: [{ tool: 'Edit', target: 'src/login.ts' }] }),
      }),
    );
    expect(words.join(' ')).toContain('login.ts');
  });

  it('shows the branch and repository where git is the work', () => {
    const words = textsOf(paint('git-graph')).join(' ');
    expect(words + textsOf(paint('git-diff')).join(' ')).toContain('feat/login');
  });
});
