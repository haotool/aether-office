# ADR 0008: Separate implementation and verification in the verification ledger

[Documentation](../README.md) · [Project](../../README.md)

- Status: accepted
- Date: 2026-10-08

## Context

Contributors need to know what is built versus what has been checked on real hardware, browsers or provider versions.
Marketing-style "done" labels hide partial verification.

## Decision

`docs/verification/features.json` lists every capability with `implementationStatus` (`not_started`, `partial`,
`implemented`) and `verificationStatus` (`not_run`, `partial`, `passed`, `failed`, `blocked`, `not_applicable`) as
orthogonal fields. `scripts/verification-ledger.ts` generates `docs/verification/report.md` from the verification ledger and fails
`pnpm run verification:check` when the report is stale or references missing tests. A row may be `implemented` with
`verificationStatus: partial` when blockers name the missing environment (for example Linux PTY runs not executed).

## Consequences

- README and release notes must not claim full verification when the verification ledger row is partial; the report table is the
  public summary.
- Scorecard maturity (`scripts/quality/areas/maturity.mjs`) averages both columns—passing tests alone does not imply
  implementation is complete.
