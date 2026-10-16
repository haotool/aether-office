import { mkdtempSync, readdirSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { expect, it } from 'vitest';
import { connect } from '../../apps/control/src/db/connection.js';
import checksums from './fixtures/migration-checksums.json';
import { fixture } from './fixture.js';

it.each(['original', 'withoutComments'] as const)(
  'reopens %s migration history twice without changing stored data or checksums',
  (history) => {
    const directory = mkdtempSync(join(tmpdir(), 'aether-migration-history-'));
    const file = join(directory, 'control.sqlite');
    try {
      const { control, send } = fixture(file);
      send('保留既有對話與專案');
      const sql = control.ctx.sqlite;
      for (const [version, hashes] of Object.entries(checksums))
        sql
          .prepare('UPDATE schema_migrations SET checksum=? WHERE version=?')
          .run(hashes[history], Number(version));
      const tables = ['projects', 'messages', 'schema_migrations'];
      const stored = tables.map((table) => sql.prepare(`SELECT * FROM ${table}`).all());
      control.close();
      for (let restart = 0; restart < 2; restart++) {
        const { sqlite } = connect(file);
        try {
          expect(tables.map((table) => sqlite.prepare(`SELECT * FROM ${table}`).all())).toEqual(
            stored,
          );
          expect(sqlite.pragma('integrity_check', { simple: true })).toBe('ok');
        } finally {
          sqlite.close();
        }
      }
      expect(readdirSync(directory).some((name) => name.includes('.pre-migration-'))).toBe(false);
    } finally {
      rmSync(directory, { recursive: true, force: true });
    }
  },
);

it.each(['0'.repeat(64), checksums['18'].withoutComments])(
  'rejects an unapproved or wrong-version checksum for an affected migration: %s',
  (checksum) => {
    const directory = mkdtempSync(join(tmpdir(), 'aether-migration-tamper-'));
    const file = join(directory, 'control.sqlite');
    try {
      const { sqlite } = connect(file);
      sqlite.prepare('UPDATE schema_migrations SET checksum=? WHERE version=17').run(checksum);
      sqlite.close();
      expect(() => connect(file)).toThrow(/migration 17 was edited/);
    } finally {
      rmSync(directory, { recursive: true, force: true });
    }
  },
);
