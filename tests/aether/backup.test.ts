import {
  appendFileSync,
  existsSync,
  mkdtempSync,
  readFileSync,
  readdirSync,
  rmSync,
  writeFileSync,
} from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { expect, it } from 'vitest';
import { createBackup, restoreBackup } from '../../apps/control/src/backup.js';
import { Control } from '../../apps/control/src/control.js';
import { fixture } from './fixture.js';
import checksums from './fixtures/migration-checksums.json';

it.each(['original', 'withoutComments'] as const)(
  'backs up and reopens %s migration history twice with identical data',
  async (history) => {
    const directory = mkdtempSync(join(tmpdir(), 'aether-backup-'));
    try {
      const f = fixture(join(directory, 'live', 'control.sqlite'));
      const sql = f.control.ctx.sqlite;
      for (const body of ['one', 'two', 'three']) f.send(body);
      for (const [version, hashes] of Object.entries(checksums))
        sql
          .prepare('UPDATE schema_migrations SET checksum=? WHERE version=?')
          .run(hashes[history], Number(version));
      const tables = ['projects', 'messages', 'schema_migrations'];
      const stored = tables.map((table) => sql.prepare(`SELECT * FROM ${table}`).all());
      expect(sql.pragma('journal_mode', { simple: true })).toBe('wal');

      const { manifestPath, manifest } = await createBackup(sql, join(directory, 'backups'));
      f.send('after');
      expect(manifest.rows['messages']).toBe(3);
      expect(manifest.schemaVersions.length).toBeGreaterThan(10);
      expect(manifest.sha256).toMatch(/^[0-9a-f]{64}$/);

      const restored = restoreBackup(manifestPath, join(directory, 'restored'));
      for (let restart = 0; restart < 2; restart++) {
        const control = new Control(restored.database, { mode: 'demo' });
        try {
          expect(
            tables.map((table) => control.ctx.sqlite.prepare(`SELECT * FROM ${table}`).all()),
          ).toEqual(stored);
          expect(control.ctx.sqlite.pragma('integrity_check', { simple: true })).toBe('ok');
          expect(control.authenticate(f.owner.token).role).toBe('owner');
        } finally {
          control.close();
        }
      }
      f.control.close();
      expect(readdirSync(join(directory, 'restored'))).toContain('control.sqlite');
    } finally {
      rmSync(directory, { recursive: true, force: true });
    }
  },
);

it('refuses tampered backups, non-empty targets, unknown formats and newer schemas, leaving nothing half-restored', async () => {
  const directory = mkdtempSync(join(tmpdir(), 'aether-backup-bad-'));
  try {
    const f = fixture(join(directory, 'control.sqlite'));
    const { manifestPath, manifest } = await createBackup(
      f.control.ctx.sqlite,
      join(directory, 'backups'),
    );

    expect(() => restoreBackup(manifestPath, join(directory, 'ok'))).not.toThrow();
    expect(() => restoreBackup(manifestPath, join(directory, 'ok'))).toThrow(
      'RESTORE_TARGET_NOT_EMPTY',
    );

    const backupFile = join(directory, 'backups', manifest.file);
    appendFileSync(backupFile, 'tamper');
    expect(() => restoreBackup(manifestPath, join(directory, 'tampered'))).toThrow(
      'BACKUP_CHECKSUM_MISMATCH',
    );
    expect(existsSync(join(directory, 'tampered', 'control.sqlite'))).toBe(false);

    const unknown = join(directory, 'backups', 'unknown.json');
    writeFileSync(unknown, JSON.stringify({ ...manifest, format: 2 }));
    expect(() => restoreBackup(unknown, join(directory, 'format'))).toThrow(
      'BACKUP_FORMAT_UNSUPPORTED',
    );

    const clean = await createBackup(f.control.ctx.sqlite, join(directory, 'newer'));
    const futureFile = join(directory, 'newer', clean.manifest.file);
    const future = new Control(futureFile, { mode: 'demo' });
    future.ctx.sqlite.prepare("INSERT INTO schema_migrations VALUES (9999,'x',0)").run();
    future.close();
    const { createHash } = await import('node:crypto');
    clean.manifest.sha256 = createHash('sha256').update(readFileSync(futureFile)).digest('hex');
    writeFileSync(clean.manifestPath, JSON.stringify(clean.manifest));
    expect(() => restoreBackup(clean.manifestPath, join(directory, 'future'))).toThrow(
      'SCHEMA_VERSION_OR_CHECKSUM_MISMATCH',
    );
    expect(existsSync(join(directory, 'future', 'control.sqlite'))).toBe(false);
    f.control.close();
  } finally {
    rmSync(directory, { recursive: true, force: true });
  }
});
