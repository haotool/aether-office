# ADR 0006: Verified provider releases and generated protocol artifacts

- Status: accepted
- Date: 2026-10-08

## Context

Codex and Claude Code ship fast-moving CLIs and wire protocols. The adapters must match real binaries without hand-editing
thousands of generated lines or accepting unverified versions in production.

## Decision

`packages/providers/generated/compat.json` is the single verified list (`verifiedCliVersions`, `claudeCodeSeries`, schema
version). Runtime checks use `packages/providers/src/compat.ts` (`assertCodexVersion`, `assertClaudeVersion`). Generated
Codex JSON and TypeScript under `packages/providers/generated/codex-*` come from the provider CLI (`codex app-server
generate-ts`); they are committed and regenerated when the schema changes—never edited by hand for protocol fields.
`pnpm run doctor` and provider tests gate additions to `compat.json` ([provider-compatibility.md](../provider-compatibility.md)).

## Consequences

- A newer Codex patch that is byte-identical to a verified schema can be listed after doctor and tests; otherwise the
  operator sees a version mismatch, not silent drift.
- Generated folders stay in version control so CI and offline installs typecheck without calling vendor CLIs.
