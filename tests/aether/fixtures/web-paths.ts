// Where the web app's own copies of its dependencies live. The repo root has no react or zustand: `vi.mock` must name the
// file the app's source imports, so the tests resolve them from apps/web, as the app does.
import { createRequire } from 'node:module';

const resolve = createRequire(`${process.cwd()}/apps/web/package.json`).resolve;
const dir = (name: string) => resolve(`${name}/package.json`).replace(/package\.json$/, '');

export const WEB_REACT = resolve('react');
export const WEB_ZUSTAND = `${dir('zustand')}esm/index.mjs`;
export const WEB_QUERY = `${dir('@tanstack/react-query')}build/modern/index.js`;
