// Renders a web component to HTML on the server renderer (react-dom/server): the repo's vitest has no DOM environment, so
// effects do not run and what is checked is the first paint of a component for given props. Real React, real query client
// and a real router; `usePhone` hooks are replaced by the test file (they need a browser snapshot the server lacks).
import type { ReactElement } from 'react';
import { createElement as h } from '../../../apps/web/node_modules/react';
import { renderToStaticMarkup } from '../../../apps/web/node_modules/react-dom/server.node.js';
import {
  QueryClient,
  QueryClientProvider,
} from '../../../apps/web/node_modules/@tanstack/react-query/build/modern/index.js';
import { MemoryRouter } from '../../../apps/web/node_modules/react-router-dom/dist/index.mjs';

export function renderHtml(element: ReactElement, client = new QueryClient(), path = '/') {
  return renderToStaticMarkup(
    h(QueryClientProvider, { client }, h(MemoryRouter, { initialEntries: [path] }, element)),
  );
}

export { h, QueryClient };

/** The visible text of rendered HTML: tags dropped, entities left as they are. */
export const textOf = (html: string) =>
  html
    .replace(/<[^>]+>/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
