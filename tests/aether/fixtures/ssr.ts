// Renders a web component to HTML on the server renderer (react-dom/server): the repo's vitest has no DOM environment,
// so effects do not run and what is checked is the first paint for given props. `usePhone` hooks are replaced by the
// test file (they need a browser snapshot).
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

export const textOf = (html: string) =>
  html
    .replace(/<[^>]+>/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
