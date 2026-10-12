import Database from 'better-sqlite3';
import { createHash } from 'node:crypto';
import {
  chmodSync,
  copyFileSync,
  existsSync,
  mkdirSync,
  readFileSync,
  rmSync,
  statSync,
  writeFileSync,
} from 'node:fs';
import { basename, dirname, join } from 'node:path';
import { connect } from './db/connection.js';

// Backups use SQLite's online backup API, never a plain file copy: with WAL active, copying only
// the main .db would miss committed data and could capture a torn state.

type BackupManifest = {
  format: 1;
  file: string;
  sha256: string;
  bytes: number;
  createdAt: number;
  schemaVersions: number[];
  rows: Record<string, number>;
};

const sha256 = (file: string) => createHash('sha256').update(readFileSync(file)).digest('hex');

function describe(db: Database.Database) {
  if (db.pragma('integrity_check', { simple: true }) !== 'ok')
    throw new Error('BACKUP_INTEGRITY_FAILED');
  const tables = (
    db
      .prepare("SELECT name FROM sqlite_master WHERE type='table' AND name NOT LIKE 'sqlite_%'")
      .all() as { name: string }[]
  ).map((t) => t.name);
  return {
    schemaVersions: (
      db.prepare('SELECT version FROM schema_migrations ORDER BY version').all() as {
        version: number;
      }[]
    ).map((r) => r.version),
    rows: Object.fromEntries(
      tables.map((t) => [
        t,
        (db.prepare(`SELECT COUNT(*) AS n FROM "${t}"`).get() as { n: number }).n,
      ]),
    ),
  };
}

export async function createBackup(
  source: Database.Database,
  directory: string,
  now = Date.now(),
): Promise<{ manifestPath: string; manifest: BackupManifest }> {
  mkdirSync(directory, { recursive: true, mode: 0o700 });
  const file = `control-${new Date(now).toISOString().replace(/[:.]/g, '-')}.sqlite`;
  const target = join(directory, file);
  await source.backup(target);
  chmodSync(target, 0o600);
  const copy = new Database(target, { readonly: true });
  const { schemaVersions, rows } = (() => {
    try {
      return describe(copy);
    } finally {
      copy.close();
    }
  })();
  const manifest: BackupManifest = {
    format: 1,
    file,
    sha256: sha256(target),
    bytes: statSync(target).size,
    createdAt: now,
    schemaVersions,
    rows,
  };
  const manifestPath = `${target}.manifest.json`;
  writeFileSync(manifestPath, `${JSON.stringify(manifest, null, 2)}\n`, { mode: 0o600 });
  return { manifestPath, manifest };
}

export function restoreBackup(
  manifestPath: string,
  targetDirectory: string,
): { database: string; manifest: BackupManifest } {
  const manifest = JSON.parse(readFileSync(manifestPath, 'utf8')) as BackupManifest;
  if (manifest.format !== 1) throw new Error('BACKUP_FORMAT_UNSUPPORTED');
  const source = join(dirname(manifestPath), basename(manifest.file)); // never a path from the manifest
  if (!existsSync(source)) throw new Error('BACKUP_FILE_MISSING');
  if (sha256(source) !== manifest.sha256) throw new Error('BACKUP_CHECKSUM_MISMATCH');
  const database = join(targetDirectory, 'control.sqlite');
  if (existsSync(database)) throw new Error('RESTORE_TARGET_NOT_EMPTY');
  mkdirSync(targetDirectory, { recursive: true, mode: 0o700 });
  copyFileSync(source, database);
  chmodSync(database, 0o600);
  try {
    const migrated = connect(database).sqlite;
    const restored = (() => {
      try {
        return describe(migrated);
      } finally {
        migrated.close();
      }
    })();
    for (const [table, count] of Object.entries(manifest.rows))
      if (restored.rows[table] !== count) throw new Error(`BACKUP_ROW_COUNT_MISMATCH:${table}`);
  } catch (error) {
    for (const suffix of ['', '-wal', '-shm']) rmSync(`${database}${suffix}`, { force: true });
    throw error;
  }
  return { database, manifest };
}
