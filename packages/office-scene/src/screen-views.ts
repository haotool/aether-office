import type { ViewId } from './screen-layout.js';
import type { ViewCtx } from './screen-theme.js';
import { drawChat, drawDesign, drawNotebook } from './screen-view-collab.js';
import { drawEditor } from './screen-view-editor.js';
import { drawDashboard, drawGitDiff, drawGitGraph, drawTests } from './screen-view-ops.js';
import { drawLock } from './screen-view-overlay.js';
import { drawTerminal } from './screen-view-terminal.js';
import { drawBrowser, drawDocs } from './screen-view-web.js';

/** Every view a desk screen can show, by the id screen-layout.ts chooses. */
export const VIEWS: Record<ViewId, (c: ViewCtx) => void> = {
  editor: drawEditor,
  terminal: drawTerminal,
  browser: drawBrowser,
  tests: drawTests,
  'git-graph': drawGitGraph,
  'git-diff': drawGitDiff,
  chat: drawChat,
  notebook: drawNotebook,
  design: drawDesign,
  docs: drawDocs,
  dashboard: drawDashboard,
  lock: drawLock,
};
