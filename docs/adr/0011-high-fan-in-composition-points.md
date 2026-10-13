# ADR 0011: High fan-in modules at intentional composition points

[Documentation](../README.md) · [Project](../../README.md)

- Status: accepted
- Date: 2026-10-08

## Context

The release scorecard flags source files imported by more than thirty others unless documented. Some modules are meant to
be the single assembly root or API façade for an app, not split for cosmetic graph metrics.

## Decision

These paths are allowed high fan-in without splitting:

- `apps/control/src/server.ts` — Fastify app wiring: registers route plugins, `PUBLIC_ROUTES`, and shared hooks in one
  place so route security tests have a single registry.
- `apps/web/src/lib/api/api.ts` — the only typed `fetch` wrapper for mutations (CSRF retry in one loop).
- `apps/web/src/ui/useT.ts` — the standard translation hook (`useT`, `useWhy`) backed by `lib/i18n/i18n.ts`.

fan-in-allow: apps/control/src/server.ts
fan-in-allow: apps/web/src/lib/api/api.ts
fan-in-allow: apps/web/src/ui/useT.ts

Splitting them into per-feature duplicates would repeat CSRF, locale and route-list logic and risk drift.

## Consequences

- No more than five `fan-in-allow:` lines may appear across `docs/adr/` (enforced when scoring release criterion L2-03).
- New high fan-in files need a new ADR rationale before adding another allow line.
