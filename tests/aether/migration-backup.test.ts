import { existsSync, mkdtempSync, readdirSync, statSync, utimesSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { expect, it } from 'vitest';
import {
  KEPT_PRE_MIGRATION_BACKUPS,
  backupBeforeMigration,
  connect,
} from '../../apps/control/src/db/connection.js';

const backups = (dir: string) => readdirSync(dir).filter((n) => n.includes('.pre-migration-'));

it('makes the pre-migration copy owner-only and keeps only the newest few', () => {
  const dir = mkdtempSync(join(tmpdir(), 'aether-premig-'));
  const file = join(dir, 'control.sqlite');
  const { sqlite } = connect(file);
  for (let i = 0; i < 5; i++) {
    const old = join(dir, `control.sqlite.pre-migration-old${i}.sqlite`);
    writeFileSync(old, 'x');
    utimesSync(old, 1_000 + i, 1_000 + i);
  }
  writeFileSync(join(dir, 'unrelated.sqlite'), 'x');
  backupBeforeMigration(sqlite, file);
  const kept = backups(dir);
  expect(kept).toHaveLength(KEPT_PRE_MIGRATION_BACKUPS);
  expect(kept).toContain('control.sqlite.pre-migration-old4.sqlite');
  expect(kept).not.toContain('control.sqlite.pre-migration-old0.sqlite');
  expect(existsSync(join(dir, 'unrelated.sqlite'))).toBe(true);
  const fresh = kept.find((name) => !name.includes('-old'))!;
  expect(statSync(join(dir, fresh)).mode & 0o777).toBe(0o600);
  sqlite.close();
});

it('says what to do when an applied migration was edited or is unknown', () => {
  const file = join(mkdtempSync(join(tmpdir(), 'aether-checksum-')), 'control.sqlite');
  const tamper = (sql: string) => {
    const { sqlite } = connect(file);
    sqlite.prepare(sql).run();
    sqlite.close();
  };
  tamper("UPDATE schema_migrations SET checksum='x' WHERE version=2");
  expect(() => connect(file)).toThrow(
    /SCHEMA_VERSION_OR_CHECKSUM_MISMATCH: migration 2 was edited/,
  );
  const other = join(mkdtempSync(join(tmpdir(), 'aether-newer-')), 'control.sqlite');
  const { sqlite } = connect(other);
  sqlite.prepare("INSERT INTO schema_migrations VALUES (9999,'x',0)").run();
  sqlite.close();
  expect(() => connect(other)).toThrow(/migration 9999 is applied in this database but unknown/);
});
