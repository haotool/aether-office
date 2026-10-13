# ADR 0006: Verified provider releases and generated protocol artifacts

[Documentation](../README.md) · [Project](../../README.md)

- Status: accepted
- Date: 2026-10-08

## Context

Codex and Claude Code ship fast-moving CLIs and wire protocols. The adapters must match real binaries without hand-editing
thousands of generated lines or accepting unverified versions in production.

## Decision

`packages/providers/generated/compat.json` is the single verified list (`verifiedCliVersions`, `claudeCodeSeries`, schema
version). Runtime checks use `packages/providers/src/compat.ts` (`assertCodexVersion`, `assertClaudeVersion`). Generated
Codex TypeScript under `packages/providers/generated/codex-*-ts` comes from the provider CLI (`codex app-server
generate-ts`); it is committed and regenerated when the schema changes—never edited by hand for protocol fields.
`pnpm run protocol:regen` rewrites it from the installed binary of the pinned release and records a digest of the files in
`compat.json` (`--check` reports drift from the binary). `tests/aether/codex-schema.test.ts` compares that digest on every
run, so a hand edit fails CI without the CLI, and regenerates the files byte for byte when the binary is installed. The
JSON Schema `generate-json-schema` also emits is not committed: nothing imports it and the TypeScript carries the same
protocol.
`pnpm run doctor` and provider tests gate additions to `compat.json` ([provider-compatibility.md](../provider-compatibility.md)).

## Consequences

- A newer Codex patch that is byte-identical to a verified schema can be listed after doctor and tests; otherwise the
  operator sees a version mismatch, not silent drift.
- Generated folders stay in version control so CI and offline installs typecheck without calling vendor CLIs.
