import Database from 'better-sqlite3';
import { readFileSync, mkdirSync, chmodSync, readdirSync, rmSync, statSync } from 'node:fs';
import { basename, dirname, join } from 'node:path';
import { createHash, randomUUID } from 'node:crypto';
export const KEPT_PRE_MIGRATION_BACKUPS = 3;

export function backupBeforeMigration(sqlite: Database.Database, filename: string) {
  const copy = `${filename}.pre-migration-${randomUUID()}.sqlite`;
  sqlite.prepare('VACUUM INTO ?').run(copy);
  chmodSync(copy, 0o600);
  const prefix = `${basename(filename)}.pre-migration-`;
  readdirSync(dirname(filename))
    .filter((name) => name.startsWith(prefix) && name.endsWith('.sqlite'))
    .map((name) => ({
      path: join(dirname(filename), name),
      at: statSync(join(dirname(filename), name)).mtimeMs,
    }))
    .sort((a, b) => b.at - a.at)
    .slice(KEPT_PRE_MIGRATION_BACKUPS)
    .forEach(({ path }) => rmSync(path, { force: true }));
}

type Migration = { version: number; source: string };
const checksumOf = (source: string) => createHash('sha256').update(source).digest('hex');

// Exact comment-removal variants shipped before the original migration text was restored.
const commentOnlyChecksums: Record<string, string> = {
  ab21ba0cf578ede71518971f241624c8990910bf900b248205502f1f3ed74a56:
    '5e145346a3c343c05ec42f4da278a8fe924eba311851df37d43d09f4fa268d35',
  b0b8e5a9e470daa804844700c75a11130d523c765d62738a9d43f375eddf9e56:
    '18531af386abae7d4bf25c61438173ec88d7206a222f8cb86c0d78ca9358b967',
  a635eea7095f753171f584ec87a89d4ada61fd40e603bfc68673c3a5e5c40896:
    '31477114ed47c027e8cafae7160e4cbc7f910a981700729257fd25846edb4f97',
  d5d797b9dff713e3964ac89f3a8408f5455f725b9d95c0a031b57b958c6e62d2:
    '6959f67f4253af702ec4b740264716b80c9c62285bfff4f8a9b86e2353bc596c',
  '8b7c64e2f67ac0c0c8d1365a8d6b28f5401ec7b01c17d6bbe4f626c591085679':
    '17f7bb55b4d82b679385e3856f36af31c4b7085179e0e1341ae366a94ae1b252',
  '853512b07ac861ed5fa23629cd5170ae115d5b97d05bf303a22709ed8569159d':
    'bf1efa85ee668a3a40f8c47cb225935185f9ad8008740c1154b7abd59efdcb6d',
  '1267b90d968f7699d6563cf2c44d1f36921abdafcbfbd95dd1f4e83648bcfd07':
    '7bc553f4c1808178f90ed4f841c0ec6972efa7446cef0c5b766a09bc5c118e2e',
  a7ee3a6bb1be513fad6cbf547450fc0cc145cae20592e649b9909aa29b0e9ca1:
    '94d52c3094b22980d22f302854d96ffd63bb6850309761239e4bc08676be60ef',
};

function loadMigrations(): Migration[] {
  return [
    { version: 1, source: readFileSync(new URL('./migration.sql', import.meta.url), 'utf8') },
    ...readdirSync(new URL('./migrations/', import.meta.url))
      .filter((name) => /^\d{3}-.+\.sql$/.test(name))
      .map((name) => ({
        version: Number(name.slice(0, 3)),
        source: readFileSync(new URL('./migrations/' + name, import.meta.url), 'utf8'),
      })),
  ].sort((a, b) => a.version - b.version);
}

function assertAppliedMatch(
  applied: { version: number; checksum: string }[],
  migrations: Migration[],
) {
  for (const record of applied) {
    const migration = migrations.find((m) => m.version === record.version);
    if (!migration)
      throw new Error(
        `SCHEMA_VERSION_OR_CHECKSUM_MISMATCH: migration ${record.version} is applied in this database but unknown to this build; the database was written by a newer version, so update AETHER or restore a backup`,
      );
    const checksum = checksumOf(migration.source);
    if (checksum !== record.checksum && commentOnlyChecksums[checksum] !== record.checksum)
      throw new Error(
        `SCHEMA_VERSION_OR_CHECKSUM_MISMATCH: migration ${record.version} was edited after it was applied; restore its original text and put the change in a new numbered migration`,
      );
  }
}

function migrate(sqlite: Database.Database, filename: string, now: () => number) {
  sqlite.exec(
    'CREATE TABLE IF NOT EXISTS schema_migrations(version INTEGER PRIMARY KEY, checksum TEXT NOT NULL, appliedAt INTEGER NOT NULL)',
  );
  const migrations = loadMigrations();
  const applied = sqlite
    .prepare('SELECT version,checksum FROM schema_migrations ORDER BY version')
    .all() as { version: number; checksum: string }[];
  assertAppliedMatch(applied, migrations);
  const pending = migrations.filter((m) => !applied.some((a) => a.version === m.version));
  if (applied.length && pending.length && filename !== ':memory:')
    backupBeforeMigration(sqlite, filename);
  for (const migration of pending)
    sqlite
      .transaction(() => {
        sqlite.exec(migration.source);
        sqlite
          .prepare('INSERT INTO schema_migrations VALUES (?,?,?)')
          .run(migration.version, checksumOf(migration.source), now());
      })
      .immediate();
}

export function connect(filename: string, now: () => number = Date.now) {
  if (filename !== ':memory:') mkdirSync(dirname(filename), { recursive: true, mode: 0o700 });
  const sqlite = new Database(filename);
  try {
    sqlite.pragma('foreign_keys = ON');
    sqlite.pragma('journal_mode = WAL');
    sqlite.pragma('synchronous = FULL');
    sqlite.pragma('busy_timeout = 5000');
    migrate(sqlite, filename, now);
    if (filename !== ':memory:') chmodSync(filename, 0o600);
    return { sqlite };
  } catch (error) {
    sqlite.close();
    throw error;
  }
}
export type Connection = ReturnType<typeof connect>;
