# ADR 0012: Product scope — what ships now, what is simplified, what waits

- Status: accepted
- Date: 2026-10-08

## Context

Pre-release planning tracked hundreds of capabilities. The public product must be honest about full integrations versus
rows in `docs/verification/features.json` and about verification depth.

## Decision

**Not release-complete (code may exist; verification ledger rows stay partial).** The verification ledger currently has
no `implementationStatus: not_started` and no `verificationStatus: blocked`; outward copy still must not imply a finished
integration when both columns are partial. Examples with current columns: third-party work trackers (`INT-01`, `INT-02`:
`implemented` / `partial`); knowledge base with provenance (`INT-04`: `partial` / `partial`); generic ACP adapter
negotiation (`STD-03`: `implemented` / `partial`); third-party artifact fetch (`STD-07`: `implemented` / `partial`);
session composer typing scoped to AETHER terminals (`OBS-COMPOSER-01`: `implemented` / `partial`); decorative Git graph
in the building (`OBS-GRAPH-01`: `implemented` / `partial`); later office-life decoration and pose follow-ups
(`OFFICE-LIFE-04`, `OFFICE-LIFE-I8-01`, `OFFICE-LIFE-F1-01`–`F1-03`: `implemented` / `partial`). Capability scope stays
in the verification ledger rather than half-shipped behind flags.

**Simplified (shipped with narrower proof).** Examples: provider resume flows (`CDX-03`: `implemented` / `partial`);
usage and budget UI (`INT-07`, `INT-08`: `partial` / `partial`); QA evidence (`QA-01`–`QA-06`: each row is
`partial` on at least one column—blockers separate synthetic demo captures from live-data proof); local session observation
(`OBS-LOCAL-01`, `OBS-PANEL-01`: `implemented` / `partial`); office-life signals (`OFFICE-LIFE-I7-01`–`I7-03`,
`OBS-LIFE-09`: `implemented` / `partial`, blockers name missing live runs or macOS-only gaps).

**Performance and runner work in progress.** Scene, camera and perf capabilities (`VIS-01`, `CAM-08`, `SCENE-PERF-P1`)
and runner PTY polish (`RUN-03`, `RUN-04`, `RUN-08`) remain `partial` on one or both columns until Linux hosts,
low-end GPUs, or real phones supply the environments described in each row's blockers—not because the file marks them
`blocked`.

## Consequences

- New capabilities get a verification ledger row before marketing copy; staying partial is explicit in
  `implementationStatus` and `verificationStatus`, not silent removal.
- When verification widens, update blockers; `partial` is not a permanent substitute for `passed`.
