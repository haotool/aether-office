# @aether/control

[Documentation](../../docs/README.md) · [Project](../../README.md)

Fastify control plane: authentication, SQLite state, HTTP API, local-session discovery, and the built web static host.

## Public surface

- Process entry: `apps/control/src/main.ts` (production server after `pnpm build`).
- Library surface used in tests: `control.ts`, `server.ts`, `routes/`, `services/`, `db/migrations/` (see `package.json` `exports`).

## Dependencies

- Depends on `@aether/contracts`, `@aether/kernel`, `@aether/providers`, Fastify, `better-sqlite3`, `zod`.
- Does not depend on `apps/web` or `apps/runner` (runner talks over HTTP).
- `apps/runner` and `apps/web` must not import control database code (`scripts/check-boundaries.mjs`).

## Run and test locally

```bash
pnpm run setup
pnpm build
pnpm start
```

Integration coverage lives in the repo root:

```bash
pnpm exec vitest run tests/aether/control.test.ts
```

Use a non-default `PORT` when 4310 is already in use.
