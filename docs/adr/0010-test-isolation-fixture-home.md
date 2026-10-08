# ADR 0010: Fixture session home and overridable E2E ports

- Status: accepted
- Date: 2026-10-08

## Context

Tests and Playwright must not read or write the operator's real Claude/Codex session directories or collide with a dev
server on fixed ports.

## Decision

Tests point session discovery at a temporary directory via `AETHER_LOCAL_SESSIONS_HOME` (see `playwright.config.ts` and
`docs/development.md`). End-to-end servers read `AETHER_E2E_PORT` and `AETHER_E2E_NATIVE_PORT` (defaults 4320 and 4330 in
`scripts/e2e-server.ts` and `scripts/e2e-native-server.ts`) so a second checkout can run its own pair. Local development
convention reserves port 4310 for a long-running `pnpm start` control plane; screenshot and documentation examples use
other ports (see [docs/images/README.md](../images/README.md), for example 4511). Heavy full-suite Playwright runs stay
a maintainer concern; unit and integration tests use vitest with the same fixture-home pattern.

## Consequences

- CI and local test instructions must export a fresh `AETHER_LOCAL_SESSIONS_HOME` (or rely on Playwright setup) before
  scanning sessions.
- Documentation must not tell contributors to run E2E on 4310 while a personal `pnpm start` is bound there.
