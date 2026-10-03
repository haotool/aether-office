import Database from 'better-sqlite3';
import { drizzle } from 'drizzle-orm/better-sqlite3';
import { readFileSync, mkdirSync, chmodSync, readdirSync } from 'node:fs';
import { dirname } from 'node:path';
import { createHash, randomUUID } from 'node:crypto';
import * as schema from './schema.js';
export function connect(filename: string, now: () => number = Date.now) {
  if (filename !== ':memory:') mkdirSync(dirname(filename), { recursive: true, mode: 0o700 });
  const sqlite = new Database(filename);
  try {
    sqlite.pragma('foreign_keys = ON');
    sqlite.pragma('journal_mode = WAL');
    sqlite.pragma('synchronous = FULL');
    sqlite.pragma('busy_timeout = 5000');
    sqlite.exec(
      'CREATE TABLE IF NOT EXISTS schema_migrations(version INTEGER PRIMARY KEY, checksum TEXT NOT NULL, appliedAt INTEGER NOT NULL)',
    );
    const migrations = [
      { version: 1, source: readFileSync(new URL('./migration.sql', import.meta.url), 'utf8') },
      ...readdirSync(new URL('./migrations/', import.meta.url))
        .filter((name) => /^\d{3}-.+\.sql$/.test(name))
        .map((name) => ({
          version: Number(name.slice(0, 3)),
          source: readFileSync(new URL('./migrations/' + name, import.meta.url), 'utf8'),
        })),
    ].sort((a, b) => a.version - b.version);
    const applied = sqlite
      .prepare('SELECT version,checksum FROM schema_migrations ORDER BY version')
      .all() as { version: number; checksum: string }[];
    for (const record of applied) {
      const migration = migrations.find((m) => m.version === record.version);
      if (
        !migration ||
        createHash('sha256').update(migration.source).digest('hex') !== record.checksum
      )
        throw new Error('SCHEMA_VERSION_OR_CHECKSUM_MISMATCH');
    }
    const pending = migrations.filter((m) => !applied.some((a) => a.version === m.version));
    if (applied.length && pending.length && filename !== ':memory:')
      sqlite.prepare('VACUUM INTO ?').run(filename + `.pre-migration-${randomUUID()}.sqlite`);
    for (const migration of pending)
      sqlite
        .transaction(() => {
          sqlite.exec(migration.source);
          sqlite
            .prepare('INSERT INTO schema_migrations VALUES (?,?,?)')
            .run(
              migration.version,
              createHash('sha256').update(migration.source).digest('hex'),
              now(),
            );
        })
        .immediate();
    if (filename !== ':memory:') chmodSync(filename, 0o600);
    return { sqlite, db: drizzle(sqlite, { schema }) };
  } catch (error) {
    sqlite.close();
    throw error;
  }
}
export type Connection = ReturnType<typeof connect>;
