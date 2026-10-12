import { describe, expect, it } from 'vitest';
import { connect } from '../../apps/control/src/db/connection.js';
import {
  insertRow,
  selectAll,
  selectIn,
  selectOne,
  table,
  updateRows,
} from '../../apps/control/src/db/query.js';
import * as schema from '../../apps/control/src/db/schema.js';

describe('typed queries', () => {
  const db = () => connect(':memory:').sqlite;
  const project = (id: string, name = id) => ({
    id,
    name,
    root: null,
    mode: 'live' as const,
    version: 1,
    createdAt: 5,
  });

  it('inserts, selects by equality, selects in a list, and updates by equality', () => {
    const sqlite = db();
    for (const id of ['a', 'b', 'c']) insertRow(sqlite, schema.projects, project(id));
    expect(selectOne(sqlite, schema.projects, { id: 'b' })).toEqual(project('b'));
    expect(selectOne(sqlite, schema.projects, { id: 'zzz' })).toBeUndefined();
    expect(selectAll(sqlite, schema.projects).map((p) => p.id)).toEqual(['a', 'b', 'c']);
    expect(
      selectIn(sqlite, schema.projects, 'id', ['c', 'a'])
        .map((p) => p.id)
        .sort(),
    ).toEqual(['a', 'c']);
    expect(selectIn(sqlite, schema.projects, 'id', [])).toEqual([]);
    updateRows(sqlite, schema.projects, { id: 'b' }, { name: 'renamed', version: 2 });
    expect(selectOne(sqlite, schema.projects, { id: 'b' })).toMatchObject({
      name: 'renamed',
      version: 2,
    });
    expect(selectOne(sqlite, schema.projects, { id: 'a' })?.name).toBe('a');
    updateRows(sqlite, schema.projects, { id: 'b' }, {});
  });

  it('keeps JSON columns as values, and ignores undefined conditions', () => {
    const sqlite = db();
    insertRow(sqlite, schema.identities, {
      id: 'i1',
      role: 'owner',
      name: 'Owner',
      tokenHash: 'h1',
      projectIds: ['p1', 'p2'],
      agentId: null,
      machineId: null,
      revokedAt: null,
      createdAt: 1,
      expiresAt: null,
    });
    expect(selectOne(sqlite, schema.identities, { tokenHash: 'h1' })?.projectIds).toEqual([
      'p1',
      'p2',
    ]);
    expect(selectAll(sqlite, schema.identities, { name: undefined })).toHaveLength(1);
  });

  it('refuses a column the table does not have, so a name can never carry SQL', () => {
    const sqlite = db();
    const bad = table<{ id: string }>('projects', ['id']);
    expect(() => selectAll(sqlite, schema.projects, { 'id=1 OR 1': 'x' } as never)).toThrow(
      'UNKNOWN_COLUMN',
    );
    expect(() => selectOne(sqlite, bad, { id: 'x' })).not.toThrow();
    expect(() => updateRows(sqlite, schema.projects, { id: 'a' }, { nope: 1 } as never)).toThrow(
      'UNKNOWN_COLUMN',
    );
  });

  it('describes real columns: every column the schema lists exists in the migrated database', () => {
    const sqlite = db();
    for (const t of Object.values(schema).filter((v) => typeof v === 'object')) {
      const actual = (
        sqlite.prepare(`PRAGMA table_info(${t.name})`).all() as { name: string }[]
      ).map((c) => c.name);
      expect(actual.length, t.name).toBeGreaterThan(0);
      expect(
        t.columns.filter((c) => !actual.includes(c)),
        t.name,
      ).toEqual([]);
    }
  });
});
