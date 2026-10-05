# ADR 0002: The runner never writes the control database

- Status: accepted

## Context

Agents execute code, touch the filesystem and can crash or be killed mid-operation. The control plane holds the durable record of
what happened and who may do what.

## Decision

Only `apps/control` opens the SQLite database. The runner is a separate process that authenticates with its own scoped token,
**claims** jobs and **reports** results over HTTP. Before any side effect it records its intent in a local journal, and after a
restart it reconciles instead of blindly retrying. Whatever is uncertain becomes `indeterminate` and waits for a person.

## Consequences

- A compromised or crashed runner cannot corrupt the control state or escalate its role.
- Every side effect needs an idempotent report path and a journal entry, which adds code but removes whole classes of
  duplicate-execution bugs.
- `scripts/check-boundaries.mjs` enforces that the runner does not import the database layer.
