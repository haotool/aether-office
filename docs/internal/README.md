# Internal notes

[Documentation](../README.md) · [Project](../../README.md)

Working notes from the maintainers: audits, feasibility studies and risk assessments written while the project was built. They are
**not required reading** to use or contribute to AETHER OFFICE. They are kept because the decisions in
[`docs/adr`](../adr/README.md) and the numbers in [`docs/quality`](../quality/README.md) cite them.

Each note is a dated snapshot written in Traditional Chinese, as the maintainers took it. Where a note differs from the
[manual](../README.md) or the code, the manual and the code win. Nothing here is a promise about the roadmap.

| Note                                                             | What it is                                                                         | Snapshot   |
| ---------------------------------------------------------------- | ---------------------------------------------------------------------------------- | ---------- |
| [Design review](design-review.md)                                | Read-only audit of design problems before the open-source release                  | 2026-10-07 |
| [Feature maturity](feature-maturity.md)                          | Hands-on check of what works, with the evidence grade for each finding             | 2026-10-07 |
| [Usage audit](usage-audit.md)                                    | How tokens, usage, context and git KPIs are read, checked against real local data  | 2026-10-07 |
| [UI token audit](ui-token-audit.md)                              | Why spacing and role specs drift, and the rules the design-token lint now enforces | 2026-10-07 |
| [Mobile gradient and frame performance](mobile-gradient-perf.md) | Banding, dithering, GPU tiers and phone budgets: sources, audit, measurements      | 2026-10-07 |
| [Orca view feasibility](orca-view-feasibility.md)                | A read-only office view over the Orca orchestrator: sources, risks, phases         | 2026-10-07 |
| [Orca forward compatibility](orca-forward-compat.md)             | How a newer Orca release could work without a code change, and be trusted          | 2026-10-07 |
| [Open-source risk assessment](oss-risk-assessment.md)            | Pre-publication risk snapshot with a dated current-status header                   | 2026-10-07 |

The comparison of the 27 projects that shaped the design is public and lives in [`docs/research`](../research/README.md).
