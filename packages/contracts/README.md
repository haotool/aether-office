# @aether/contracts

Shared Zod schemas and TypeScript types for commands, events, sessions, runner protocol, and permissions.

## Public surface

- Single export: `packages/contracts/src/index.ts` (`export` in `package.json`).
- Domain modules: `commands.ts`, `events.ts`, `sessions.ts`, `runner.ts`, `permissions.ts`, `records.ts`, `usage.ts`.

## Dependencies

- Depends only on `zod` (plus its own files). No workspace packages, Node built-ins, React, or providers
  (`scripts/check-boundaries.mjs`).

## Consumers

Imported by `apps/control`, `apps/runner`, `apps/web`, `packages/kernel`, and `packages/providers`.

## Test locally

```bash
pnpm exec vitest run tests/aether/contracts-command-groups.test.ts
```
