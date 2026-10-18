# ADR 0006: Verified provider releases and generated protocol artifacts

[Documentation](../README.md) · [Project](../../README.md)

- Status: amended 2026-10-19 (version admission; generated provenance retained)
- Date: 2026-10-08

## Context

Codex and Claude Code ship fast-moving CLIs and wire protocols. The adapters must match real binaries without hand-editing
thousands of generated lines. Exact release admission caused compatible upgrades to stop loading.

## Decision

Provider admission uses version syntax and the official runtime protocol, not a release allowlist. Codex initializes the
stable app-server surface; Claude initializes through the pinned Agent SDK. Required response fields and approval scopes
remain validated, opaque additions are ignored, and unknown server requests are refused. Observers validate project and
session metadata, read only visible known message shapes and skip opaque additions. Previously rejected observer checkpoints
can be re-read with stable event identities, without rewriting the transcript.

`packages/providers/generated/compat.json` remains historical provenance for the generated Codex reference types, not an
admission policy. Generated TypeScript is committed unmodified with a digest; offline CI can verify it without a CLI.
`pnpm run protocol:regen` remains available for intentional protocol changes. Adding a CLI release to the historical list
is unnecessary for runtime admission.

## Consequences

- Compatible upgrades load without repository edits, including future major and prerelease versions.
- Genuine required-protocol changes still fail safely and can require an adapter fix; no blanket future compatibility claim.
- No schema downloads, dependency updates or paid model probes occur during startup.
