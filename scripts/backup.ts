import { resolve } from 'node:path';
import { createBackup, restoreBackup } from '../apps/control/src/backup.js';
import { Control } from '../apps/control/src/control.js';

// Restore never overwrites: it needs an empty target. cursor-secret and owner-token live outside the database; copy
// them yourself if you want existing sessions and cursors to stay valid.
const [action, ...rest] = process.argv.slice(2);
const flag = (name: string) => {
  const at = rest.indexOf(name);
  return at < 0 ? undefined : rest[at + 1];
};

if (action === 'create') {
  const data = resolve(flag('--data') ?? process.env['AETHER_DATA_DIR'] ?? '.data/live');
  const control = new Control(resolve(data, 'control.sqlite'), { mode: 'live' });
  try {
    const { manifestPath, manifest } = await createBackup(
      control.ctx.sqlite,
      resolve(flag('--out') ?? resolve(data, 'backups')),
    );
    console.log(
      `backup ${manifest.sha256.slice(0, 12)} (${manifest.bytes} bytes): ${manifestPath}`,
    );
  } finally {
    control.close();
  }
} else if (action === 'restore') {
  const from = flag('--from');
  const to = flag('--to');
  if (!from || !to) {
    console.error('usage: pnpm run backup -- restore --from <manifest.json> --to <new directory>');
    process.exit(2);
  }
  const { database } = restoreBackup(resolve(from), resolve(to));
  console.log(`restored and verified: ${database}`);
} else {
  console.error('usage: pnpm run backup -- <create|restore> ...');
  process.exit(2);
}
