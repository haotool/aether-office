# @aether/providers

[Documentation](../../docs/README.md) · [Project](../../README.md)

Adapters for Claude Code, Codex app-server, and ACP agents; hook installation; generated Codex protocol types.

## Public surface

- Main export: `packages/providers/src/index.ts`.
- Subpaths: `@aether/providers/models`, `@aether/providers/approval-config` (`package.json` `exports`).
- Generated artifacts: `packages/providers/generated/` (Codex TypeScript types of the pinned release; `pnpm run protocol:regen`).

## Dependencies

- Depends on `@aether/contracts`, MCP/ACP SDKs, `@anthropic-ai/claude-agent-sdk`, `zod`.
- Must not import `apps/control` (`scripts/check-boundaries.mjs`).
- Used by `apps/control` and `apps/runner`, not by `apps/web`.

## Test locally

```bash
pnpm exec vitest run tests/aether/provider-compat.test.ts
pnpm run doctor
```

Host CLI version checks (optional): `pnpm run test:host-clis`.
