import { build } from 'esbuild';
import { spawnSync } from 'node:child_process';
import { readFile, mkdir, copyFile, cp } from 'node:fs/promises';
function run(args, cwd = process.cwd()) {
  const result = spawnSync(process.execPath, args, { cwd, stdio: 'inherit' });
  if (result.status !== 0) process.exit(result.status ?? 1);
}
run(['node_modules/typescript/bin/tsc', '--noEmit']);
run(['node_modules/vite/bin/vite.js', 'build'], 'apps/web');
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
