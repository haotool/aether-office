# ADR 0003: One SQLite database owned by the control plane

[Documentation](../README.md) · [Project](../../README.md)

- Status: accepted
- Date: 2026-10-08

## Context

The product keeps durable state (projects, commands, events, sessions metadata, usage rollups) on the operator's machine.
Multiple processes cooperate: a browser UI, an optional runner and provider CLIs. Only one process must hold the canonical
write path to avoid split-brain and torn transactions.

## Decision

`apps/control` opens the only SQLite database (`better-sqlite3`, WAL, migrations under `apps/control/src/db/migrations`).
The data directory defaults to `.data/live` (`AETHER_DATA_DIR`). Backups are created with `pnpm run backup` via
`apps/control/src/backup.ts` (manifest + files; restore targets an empty directory; invoked via `scripts/backup.ts`). The runner and browser never open
that database; the runner reports over HTTP (see ADR 0002).

## Consequences

- All authoritative reads and writes for platform state go through the control HTTP API or in-process control services.
- Operators back up and restore the control data directory; provider transcript folders under the user's CLI homes stay
  outside this database and are read-only to the scanner.
