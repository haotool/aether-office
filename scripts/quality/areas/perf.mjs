// Area 6: performance budgets. Measured from the web build in apps/web/dist (run `pnpm build` first). Budgets are read
// from scripts/check-bundle-size.mjs and docs/design-system.md; a measurement that needs a GPU run is reported as not run.
import { existsSync, readFileSync, readdirSync } from 'node:fs';
import path from 'node:path';
import { gzipSync } from 'node:zlib';
import { at, top } from '../lib.mjs';
import { info, rule, skipped } from '../model.mjs';
import { matching } from '../repo.mjs';

const BUDGET_SCRIPT = 'scripts/check-bundle-size.mjs';
const DIST = 'apps/web/dist';
/** docs/design-system.md, "Phone budgets": the page, panel and styles without the 3D office are 186 KB transferred. */
export const FIRST_LOAD_BUDGET_KB = 200;

export const gzipKb = (buffer) => gzipSync(buffer).length / 1024;

/** What the server sends: the pre-compressed .br copy the build writes, else the gzip size of the file. */
export const transferredKb = (file) =>
  existsSync(`${file}.br`) ? readFileSync(`${file}.br`).length / 1024 : gzipKb(readFileSync(file));

/** The budget constants of the bundle-size gate, so there is one place that defines them. */
export function bundleBudgets(script) {
  const read = (name) => Number(new RegExp(`const ${name}\\s*=\\s*(\\d+)`).exec(script)?.[1]);
  return { total: read('TOTAL_BUDGET_KB'), chunk: read('CHUNK_BUDGET_KB') };
}

/** Assets the entry page loads before anything else: scripts, modulepreloads and stylesheets of index.html. */
export function firstLoadAssets(html) {
  const refs = [...html.matchAll(/<(?:script|link)\b[^>]*?(?:src|href)="([^"]+)"[^>]*>/g)]
    .filter(([tag]) => /type="module"|rel="modulepreload"|rel="stylesheet"/.test(tag))
    .map((m) => m[1]);
  return [...new Set(refs)].filter((r) => /\.(js|css)$/.test(r));
}

function measureDist(root) {
  const dist = path.join(root, DIST);
  const assets = path.join(dist, 'assets');
  if (!existsSync(assets)) return null;
  const sized = (name) => ({ name, kb: gzipKb(readFileSync(path.join(assets, name))) });
  const js = readdirSync(assets)
    .filter((n) => n.endsWith('.js'))
    .map(sized)
    .sort((a, b) => b.kb - a.kb);
  const css = readdirSync(assets)
    .filter((n) => n.endsWith('.css'))
    .map(sized);
  const html = readFileSync(path.join(dist, 'index.html'), 'utf8');
  const first = firstLoadAssets(html).map((ref) => ({
    name: ref,
    kb: transferredKb(path.join(dist, ref.replace(/^\//, ''))),
  }));
  // The language table is fetched right after the entry script (main.tsx awaits it before the first render), so the
  // larger of the two is part of the first load even though index.html does not preload it.
  const tables = readdirSync(assets)
    .filter((n) => /^(en|zh)-[\w-]+\.js$/.test(n))
    .map((n) => ({ name: `/assets/${n}`, kb: transferredKb(path.join(assets, n)) }))
    .sort((a, b) => b.kb - a.kb);
  if (tables[0]) first.push(tables[0]);
  return { js, css, first };
}

const NOT_BUILT = `no ${DIST}: run pnpm build first`;

export function perf(repo) {
  const budgets = bundleBudgets(repo.read(BUDGET_SCRIPT));
  const built = measureDist(repo.root);
  const sources = matching(repo, /^apps\/web\/src\/.*\.css$/);
  const cssBytes = sources.reduce((n, f) => n + Buffer.byteLength(repo.read(f)), 0);
  const gpu = skipped(
    'perf-matrix',
    'Frame times and draw cost (scripts/perf-matrix.mjs)',
    30,
    'not run: needs a real GPU (PERF_GPU=1); the measured numbers in docs/design-system.md are not re-scored',
  );
  if (!built)
    return [
      skipped('bundle-total', 'Web JavaScript, total gzip', 25, NOT_BUILT),
      skipped('bundle-chunk', 'Largest JavaScript chunk, gzip', 15, NOT_BUILT),
      skipped('first-load', 'First-load JavaScript and CSS, transferred', 30, NOT_BUILT),
      gpu,
      info(
        'css-sources',
        'Stylesheet files in apps/web/src',
        sources.length,
        [],
        `${(cssBytes / 1024).toFixed(0)} KB source; no budget is documented for CSS`,
      ),
    ];
  const total = built.js.reduce((n, a) => n + a.kb, 0);
  const firstKb = built.first.reduce((n, a) => n + a.kb, 0);
  const cssKb = built.css.reduce((n, a) => n + a.kb, 0);
  const fmt = (a) =>
    at(`${DIST}${a.name.startsWith('/') ? '' : '/assets/'}${a.name}`, 1, `${a.kb.toFixed(0)} KB`);
  return [
    rule({
      id: 'bundle-total',
      label: `Web JavaScript total, gzip (budget ${budgets.total} KB)`,
      weight: 25,
      value: Math.round(total),
      limit: budgets.total,
      full: budgets.total / 2,
      unit: 'KB',
      details: top(built.js.slice(0, 8).map(fmt)),
    }),
    rule({
      id: 'bundle-chunk',
      label: `Largest JavaScript chunk, gzip (budget ${budgets.chunk} KB)`,
      weight: 15,
      value: Math.round(built.js[0].kb),
      limit: budgets.chunk,
      full: budgets.chunk / 2,
      unit: 'KB',
      details: [fmt(built.js[0])],
    }),
    rule({
      id: 'first-load',
      label: `First-load JavaScript and CSS, transferred (budget ${FIRST_LOAD_BUDGET_KB} KB)`,
      weight: 30,
      value: Math.round(firstKb),
      limit: FIRST_LOAD_BUDGET_KB,
      full: FIRST_LOAD_BUDGET_KB / 2,
      unit: 'KB',
      details: built.first.map(fmt),
    }),
    gpu,
    info(
      'css-sources',
      'Stylesheet files in apps/web/src',
      sources.length,
      [],
      `${(cssBytes / 1024).toFixed(0)} KB source, ${built.css.length} built file(s) at ${cssKb.toFixed(0)} KB gzip; no CSS budget is documented`,
    ),
  ];
}
