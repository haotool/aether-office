// node-pty 1.1.0's macOS prebuilt spawn-helper can arrive without executable bits.
// Replace with a private inode before chmod; never mutate a shared pnpm-store hardlink.
import { createRequire } from 'node:module';
import { dirname, join } from 'node:path';
import { existsSync, statSync, copyFileSync, chmodSync, renameSync } from 'node:fs';
if (process.platform === 'darwin') {
  const require = createRequire(new URL('../apps/runner/package.json', import.meta.url));
  const root = dirname(require.resolve('node-pty/package.json'));
  for (const folder of [
    'build/Release',
    'build/Debug',
    `prebuilds/${process.platform}-${process.arch}`,
  ]) {
    const file = join(root, folder, 'spawn-helper');
    if (existsSync(file) && (statSync(file).mode & 0o111) === 0) {
      const temporary = file + `.aether-${process.pid}`;
      copyFileSync(file, temporary);
      chmodSync(temporary, 0o755);
      renameSync(temporary, file);
      console.log('Prepared project-local node-pty spawn-helper.');
    }
  }
}
