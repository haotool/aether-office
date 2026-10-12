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
    if (checksumOf(migration.source) !== record.checksum)
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
