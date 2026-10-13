# ADR 0001: Build on an open-source foundation

[Documentation](../README.md) · [Project](../../README.md)

- Status: accepted
- Date: 2026-10-01

## Context

The project needed a 3D office, Blender-driven character pipeline and agent integrations. Starting from scratch would repeat
solved problems; adopting a project wholesale would inherit its trust model.

## Decision

Start from [AgentSystemLabs/agent-office](https://github.com/AgentSystemLabs/agent-office) (MIT, baseline commit
`665aeec571bc03f76cbd16de8d628dd169a48874`), keep its attribution, and build a separate TypeScript workspace beside it: a single
SQLite control plane (`apps/control`), an independent runner (`apps/runner`), a React workbench (`apps/web`) and shared packages.
The upstream server was never wired into the new control plane. Reusable modules (rounded-geometry helpers, the Blender
modelling kit) were adopted one by one after review of their source, resource lifecycle and tests. The upstream application has
since been removed from the tree; it remains in the repository history.

Other projects were studied for ideas, not code: their approaches to session observation, worktree safety, event delivery and
process lifecycle informed the design, and any adapted code is credited in `THIRD_PARTY_NOTICES.md`. See
[research](../research/README.md).

## Consequences

- Upstream tests establish only their own scope; the project's acceptance is the [verification ledger](../verification/report.md).
- No upstream control path may bypass permissions; there is no legacy escape hatch.
- Maturity is established by checks that were actually run, not by reputation of a dependency or a source project.
