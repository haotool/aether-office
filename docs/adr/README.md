# Architecture decision records

[Documentation](../README.md) · [Project](../../README.md)

Short, durable decisions about how AETHER OFFICE is built. For current behaviour, prefer [architecture.md](../architecture.md),
[features.md](../features.md) and the [verification report](../verification/report.md).

| ADR                                                 | Title                                                               | Status   | Date       | Summary                                                                                      |
| --------------------------------------------------- | ------------------------------------------------------------------- | -------- | ---------- | -------------------------------------------------------------------------------------------- |
| [0001](0001-open-source-foundation.md)              | Build on an open-source foundation                                  | accepted | 2026-10-01 | Fork agent-office for the 3D office and Blender pipeline; separate TypeScript control plane. |
| [0002](0002-runner-never-writes-the-database.md)    | The runner never writes the control database                        | accepted | 2026-10-01 | Runner claims jobs and reports over HTTP; only control opens SQLite.                         |
| [0003](0003-single-sqlite-control-plane.md)         | One SQLite database owned by the control plane                      | accepted | 2026-10-08 | Single WAL database, backup CLI, no runner writes.                                           |
| [0004](0004-module-layer-boundaries.md)             | Enforced module layers between apps and packages                    | accepted | 2026-10-08 | `check-boundaries.mjs` blocks cross-layer imports.                                           |
| [0005](0005-permission-model-no-bypass.md)          | No permission bypass; remote approvals with explicit timeouts       | accepted | 2026-10-08 | No global auto-approve; LAN remote approvals opt-in.                                         |
| [0006](0006-provider-compat-generated-artifacts.md) | Verified provider releases and generated protocol artifacts         | accepted | 2026-10-08 | `compat.json` plus generated Codex types; doctor gates versions.                             |
| [0007](0007-localization-structure.md)              | Traditional Chinese and English locale tables                       | accepted | 2026-10-08 | Web `Record<Key, string>` tables; scene takes `locale` prop.                                 |
| [0008](0008-verification-ledger-two-columns.md)     | Separate implementation and verification in the verification ledger | accepted | 2026-10-08 | `features.json` splits built vs verified; report is generated.                               |
| [0009](0009-mobile-performance-measurement.md)      | Relative mobile performance measurement (harness only)              | accepted | 2026-10-08 | A/B harness and `?fieldperf=1` capture; not absolute phone proof.                            |
| [0010](0010-test-isolation-fixture-home.md)         | Fixture session home and overridable E2E ports                      | accepted | 2026-10-08 | `AETHER_LOCAL_SESSIONS_HOME` and E2E port env vars.                                          |
| [0011](0011-high-fan-in-composition-points.md)      | High fan-in modules at intentional composition points               | accepted | 2026-10-08 | Allowlisted server, API client and `useT` hooks.                                             |
| [0012](0012-product-scope-tradeoffs.md)             | Product scope — what ships now, what is simplified, what waits      | accepted | 2026-10-08 | Deferred integrations vs simplified partial verification.                                    |
