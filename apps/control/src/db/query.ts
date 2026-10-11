import type { Database } from 'better-sqlite3';

/**
 * Typed queries for equality lookups, IN lookups and inserts or updates by equality; everything else is SQL where it is
 * used. Table and column names come from `schema.ts`, never from input; values are always bound.
 */
type Table<R> = {
  readonly name: string;
  readonly columns: readonly (keyof R & string)[];
  readonly json: readonly (keyof R & string)[];
};
export const table = <R>(
  name: string,
  columns: readonly (keyof R & string)[],
  json: readonly (keyof R & string)[] = [],
): Table<R> => ({ name, columns, json });

type Where<R> = { [K in keyof R]?: R[K] };

const IDENTIFIER = /^[A-Za-z][A-Za-z0-9_]*$/;
const known = <R>(t: Table<R>, column: string) => {
  if (!IDENTIFIER.test(column) || !(t.columns as readonly string[]).includes(column))
    throw new Error(`UNKNOWN_COLUMN ${t.name}.${column}`);
  return column;
};
const bound = <R>(t: Table<R>, column: string, value: unknown) =>
  (t.json as readonly string[]).includes(column) ? JSON.stringify(value) : (value ?? null);
const decode = <R>(t: Table<R>, row: Record<string, unknown>): R => {
  for (const column of t.json)
    if (typeof row[column] === 'string') row[column] = JSON.parse(row[column]);
  return row as R;
};
const conditions = <R>(t: Table<R>, where: Where<R>) => {
  const entries = Object.entries(where).filter(([, v]) => v !== undefined);
  return {
    sql: entries.length
      ? ` WHERE ${entries.map(([c]) => `${known(t, c)}=@w_${c}`).join(' AND ')}`
      : '',
    params: Object.fromEntries(entries.map(([c, v]) => [`w_${c}`, bound(t, c, v)])),
  };
};

export function selectAll<R>(db: Database, t: Table<R>, where: Where<R> = {}): R[] {
  const { sql, params } = conditions(t, where);
  return (
    db.prepare(`SELECT ${t.columns.join(',')} FROM ${t.name}${sql}`).all(params) as Record<
      string,
      unknown
    >[]
  ).map((r) => decode(t, r));
}

export function selectOne<R>(db: Database, t: Table<R>, where: Where<R>): R | undefined {
  const { sql, params } = conditions(t, where);
  const row = db
    .prepare(`SELECT ${t.columns.join(',')} FROM ${t.name}${sql} LIMIT 1`)
    .get(params) as Record<string, unknown> | undefined;
  return row ? decode(t, row) : undefined;
}

export function selectIn<R>(
  db: Database,
  t: Table<R>,
  column: keyof R & string,
  values: readonly string[],
): R[] {
  if (!values.length) return [];
  const marks = values.map(() => '?').join(',');
  return (
    db
      .prepare(
        `SELECT ${t.columns.join(',')} FROM ${t.name} WHERE ${known(t, column)} IN (${marks})`,
      )
      .all(...values) as Record<string, unknown>[]
  ).map((r) => decode(t, r));
}

export function insertRow<R extends object>(db: Database, t: Table<R>, row: R): void {
  const params = Object.fromEntries(
    t.columns.map((c) => [c, bound(t, c, (row as Record<string, unknown>)[c])]),
  );
  db.prepare(
    `INSERT INTO ${t.name} (${t.columns.join(',')}) VALUES (${t.columns.map((c) => `@${c}`).join(',')})`,
  ).run(params);
}

export function updateRows<R>(db: Database, t: Table<R>, where: Where<R>, patch: Where<R>): void {
  const set = Object.entries(patch).filter(([, v]) => v !== undefined);
  if (!set.length) return;
  const { sql, params } = conditions(t, where);
  db.prepare(
    `UPDATE ${t.name} SET ${set.map(([c]) => `${known(t, c)}=@s_${c}`).join(',')}${sql}`,
  ).run({
    ...params,
    ...Object.fromEntries(set.map(([c, v]) => [`s_${c}`, bound(t, c, v)])),
  });
}
