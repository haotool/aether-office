import { build } from 'esbuild';
import { spawnSync } from 'node:child_process';
import { readFile, writeFile, readdir, copyFile, cp } from 'node:fs/promises';
import { brotliCompressSync, constants, gzipSync } from 'node:zlib';
import { join } from 'node:path';
import { precacheUrls, shellVersion } from './sw-precache.ts';
function run(args, cwd = process.cwd()) {
  const result = spawnSync(process.execPath, args, { cwd, stdio: 'inherit' });
  if (result.status !== 0) process.exit(result.status ?? 1);
}
run(['node_modules/typescript/bin/tsc', '--noEmit']);
run(['node_modules/vite/bin/vite.js', 'build'], 'apps/web');
// The service worker, with the page and its hashed files to keep (see apps/web/src/sw). Written before the files are
// pre-compressed so that it gets a .br and a .gz like the rest.
const shell = precacheUrls(await readdir('apps/web/dist', { recursive: true }));
await build({
  entryPoints: ['apps/web/src/sw/sw.ts'],
  bundle: true,
  minify: true,
  format: 'iife',
  target: 'es2022',
  outfile: 'apps/web/dist/sw.js',
  define: {
    PRECACHE: JSON.stringify(shell),
    VERSION: JSON.stringify(
      shellVersion(shell, await readFile('apps/web/dist/index.html', 'utf8')),
    ),
  },
});
// Next to every text and model file of the web build, a .br and a .gz copy for the server to hand out as they are
// (@fastify/static preCompressed). A phone on Wi-Fi gets the 3D engine in 280 KB instead of 1 MB, a character in 290 KB
// instead of 970 KB. Only a copy that is smaller is kept.
async function precompress(directory) {
  for (const entry of await readdir(directory, { withFileTypes: true })) {
    const path = join(directory, entry.name);
    if (entry.isDirectory()) await precompress(path);
    else if (/\.(js|mjs|css|html|svg|json|glb|webmanifest)$/.test(entry.name)) {
      const bytes = await readFile(path);
      if (bytes.length < 1024) continue;
      // Browsers ask for brotli only over HTTPS; on plain HTTP (a phone on the local network) they ask for gzip. So
      // the large model files get gzip only, and brotli (slow to make) is kept for the small text files.
      const model = entry.name.endsWith('.glb');
      const packed = [['.gz', gzipSync(bytes, { level: 9 })]];
      if (!model)
        packed.push([
          '.br',
          brotliCompressSync(bytes, {
            params: {
              [constants.BROTLI_PARAM_QUALITY]: 11,
              [constants.BROTLI_PARAM_SIZE_HINT]: bytes.length,
            },
          }),
        ]);
      for (const [extension, copy] of packed)
        if (copy.length < bytes.length * 0.95) await writeFile(path + extension, copy);
    }
  }
}
await precompress('apps/web/dist');
for (const name of ['control', 'runner']) {
  const packages = ['contracts', 'kernel', 'providers'];
  const external = new Set();
  for (const file of [
    `apps/${name}/package.json`,
    ...packages.map((p) => `packages/${p}/package.json`),
  ]) {
    const manifest = JSON.parse(await readFile(file, 'utf8'));
    for (const dependency of Object.keys(manifest.dependencies ?? {}))
      if (!dependency.startsWith('@aether/')) external.add(dependency);
  }
  if (name === 'runner')
    await build({
      entryPoints: ['apps/runner/src/mcp-main.ts'],
      bundle: true,
      platform: 'node',
      format: 'esm',
      target: 'node24',
      outfile: 'apps/runner/dist/mcp.js',
      external: [...external],
      sourcemap: true,
    });
  await build({
    entryPoints: [`apps/${name}/src/main.ts`],
    bundle: true,
    platform: 'node',
    format: 'esm',
    target: 'node24',
    outfile: `apps/${name}/dist/main.js`,
    external: [...external],
    sourcemap: true,
  });
}
await copyFile('apps/control/src/db/migration.sql', 'apps/control/dist/migration.sql');
await cp('apps/control/src/db/migrations', 'apps/control/dist/migrations', { recursive: true });
await copyFile('packages/providers/src/fixture.mjs', 'apps/runner/dist/fixture.mjs');
console.log('AETHER web, control and runner production artifacts built.');
