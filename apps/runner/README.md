# @aether/runner

Separate process that runs agents in Git worktrees, supervises PTYs, observes transcripts, and reports to the control plane.

## Public surface

- Process entry: `apps/runner/src/main.ts`; enrollment CLI: `apps/runner/src/enroll.ts` (`pnpm runner:enroll`).
- Core modules: `runner.ts`, `native.ts`, `pty.ts`, `journal.ts`, `mcp-main.ts`.

## Dependencies

- Depends on `@aether/contracts`, `@aether/providers`, Agent SDK / MCP libraries, `node-pty`, `zod`.
- Must not import `apps/control` database modules or `better-sqlite3` (ADR 0002; enforced by `scripts/check-boundaries.mjs`).
- Control plane depends on runner only over HTTP at runtime, not as a TypeScript import from product code.

## Run and test locally

Enroll against a running control plane, then start the runner (see [native-execution.md](../../docs/native-execution.md)):

```bash
pnpm runner:enroll
pnpm runner
```

Targeted tests:

```bash
pnpm exec vitest run tests/aether/runner-mcp-main.test.ts
pnpm exec vitest run tests/aether/native-runner.test.ts
```
