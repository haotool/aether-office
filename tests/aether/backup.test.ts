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
import { command, fixture } from './fixture.js';

it('backs up a live WAL database consistently and restores it into a new directory with identical data', async () => {
  const directory = mkdtempSync(join(tmpdir(), 'aether-backup-'));
  try {
    const f = fixture(join(directory, 'live', 'control.sqlite'));
    for (const body of ['one', 'two', 'three'])
      f.control.execute(
        f.sender.actor,
        command('message.send', { recipients: [f.recipientId], body, kind: 'inform' }, f.projectId),
      );
    expect(f.control.ctx.sqlite.pragma('journal_mode', { simple: true })).toBe('wal');

    const { manifestPath, manifest } = await createBackup(
      f.control.ctx.sqlite,
      join(directory, 'backups'),
    );
    f.control.execute(
      f.sender.actor,
      command(
        'message.send',
        { recipients: [f.recipientId], body: 'after', kind: 'inform' },
        f.projectId,
      ),
    );
    expect(manifest.rows['messages']).toBe(3);
    expect(manifest.schemaVersions.length).toBeGreaterThan(10);
    expect(manifest.sha256).toMatch(/^[0-9a-f]{64}$/);

    const restored = restoreBackup(manifestPath, join(directory, 'restored'));
    const control = new Control(restored.database, { mode: 'demo' });
    try {
      expect(
        (control.ctx.sqlite.prepare('SELECT COUNT(*) AS n FROM messages').get() as { n: number }).n,
      ).toBe(3);
      expect(control.ctx.sqlite.pragma('integrity_check', { simple: true })).toBe('ok');
      expect(control.authenticate(f.owner.token).role).toBe('owner');
    } finally {
      control.close();
      f.control.close();
    }
    expect(readdirSync(join(directory, 'restored'))).toContain('control.sqlite');
  } finally {
    rmSync(directory, { recursive: true, force: true });
  }
});

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

    // A backup made by a newer version (unknown applied migration) must be refused after restoring.
    const clean = await createBackup(f.control.ctx.sqlite, join(directory, 'newer'));
    const future = new (
      f.control.ctx.sqlite.constructor as new (p: string) => typeof f.control.ctx.sqlite
    )(join(directory, 'newer', clean.manifest.file));
    future.prepare("INSERT INTO schema_migrations VALUES (9999,'x',0)").run();
    future.close();
    const { createHash } = await import('node:crypto');
    const patched = {
      ...clean.manifest,
      sha256: createHash('sha256')
        .update(readFileSync(join(directory, 'newer', clean.manifest.file)))
        .digest('hex'),
    };
    writeFileSync(clean.manifestPath, JSON.stringify(patched));
    expect(() => restoreBackup(clean.manifestPath, join(directory, 'future'))).toThrow(
      'SCHEMA_VERSION_OR_CHECKSUM_MISMATCH',
    );
    expect(existsSync(join(directory, 'future', 'control.sqlite'))).toBe(false);
    f.control.close();
  } finally {
    rmSync(directory, { recursive: true, force: true });
  }
});
