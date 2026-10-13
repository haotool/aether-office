# @aether/kernel

[Documentation](../../docs/README.md) · [Project](../../README.md)

Pure domain logic: authorization matrix, task transitions, schedules, text pipelines, session classification—no I/O.

## Public surface

- Export: `packages/kernel/src/index.ts` (`ACTIONS`, role types, markdown helpers, `classify-session`, etc.).

## Dependencies

- No runtime dependencies (`package.json` `dependencies` is empty).
- Must not import Node built-ins, React, Three.js, Fastify, SQLite, or `@aether/providers`
  (`scripts/check-boundaries.mjs`).

## Consumers

`apps/control`, `apps/web`, and `packages/office-scene` import kernel functions; runner uses contracts and providers
directly for execution.

## Test locally

```bash
pnpm run test:unit
```

Runs `tests/aether/kernel.test.ts` from the repository root.
