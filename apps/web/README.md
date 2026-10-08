# @aether/web

React workbench: panel, settings, KPIs, session feed, and lazy-loaded 3D office (`@aether/office-scene`).

## Public surface

- Vite entry: `apps/web/src/main.tsx`; routes under `apps/web/src/features/`.
- Package `exports` in `package.json` points at the web source tree for workspace typechecking.
- Shared UI helpers: `apps/web/src/ui/`, API client `apps/web/src/lib/api/api.ts`.

## Dependencies

- Depends on `@aether/contracts`, `@aether/kernel`, `@aether/office-scene`, React, Vite, TanStack Query, xterm, xyflow.
- Must not import Node built-ins, Fastify, SQLite, or `@aether/providers` (`scripts/check-boundaries.mjs`).
- `@aether/office-scene` is a sibling package, not bundled into control.

## Run and test locally

Development (with control from the repo root):

```bash
pnpm dev
```

Build the static assets consumed by control:

```bash
pnpm build
```

Example UI test:

```bash
pnpm exec vitest run tests/aether/web-query-hooks.test.ts
```
