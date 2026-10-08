# ADR 0004: Enforced module layers between apps and packages

- Status: accepted
- Date: 2026-10-08

## Context

The workspace mixes a Node control plane, a browser workbench, a Three.js scene package, pure domain logic and provider
adapters. Accidental imports (SQLite in the web bundle, React in the kernel) would break deployment models and test
isolation.

## Decision

`pnpm lint` runs `scripts/check-boundaries.mjs`, which walks `apps/` and `packages/` and rejects prohibited imports.
The rules match [architecture.md](../architecture.md): the kernel has no I/O imports; `apps/web` and
`packages/office-scene` do not import Node, Fastify, SQLite or `@aether/providers`; `packages/contracts` imports only
`zod` and its own files; `apps/runner` does not import the control database layer or `better-sqlite3`;
`packages/providers` does not import `apps/control`. Product web code must not use unsafe HTML sinks or terminal clipboard
add-ons. The runner executes agents and PTYs; the control plane schedules work and stores outcomes but does not embed
the runner's process supervision.

## Consequences

- New dependencies are checked at lint time; boundary violations fail CI the same way as type errors.
- Cross-layer sharing goes through `@aether/contracts` types and HTTP, not through direct database or runner imports from
  the web app.
