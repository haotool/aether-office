# Research

AETHER OFFICE was designed after studying 27 public projects in the same space (agent orchestrators, session observers,
terminal multiplexers, agent protocols). This folder keeps the evidence.

- `repo-selection-2026-10-01/` is the comparison of the 27 projects (report, matrix, source index). The report is written in
  Traditional Chinese.
- `SOURCES.json` pins the exact commits, licenses and the parts read of the projects studied most closely.

## What was taken, and how

Nothing was copied from a project whose license forbids it. Ideas were adopted and the code written here; where code was adapted it
is credited in [THIRD_PARTY_NOTICES.md](../../THIRD_PARTY_NOTICES.md).

| Source                      | License    | Used for                                                                                                      |
| --------------------------- | ---------- | ------------------------------------------------------------------------------------------------------------- |
| agent-office                | MIT        | The starting point; rounded-geometry helpers and the Blender kit (adapted)                                     |
| Orca                        | MIT        | Secret-redaction patterns (adapted); worktree-ownership and removal-safety principles                          |
| pixel-agents, agent-deck, agents-observe | MIT | Permission-wait and elicitation as "needs a person", hook freshness, Codex `session_meta` shape        |
| Gas City, Gas Town          | MIT        | Orphan and liveness reasoning, escalation order, atomic file creation                                          |
| cli-agent-orchestrator      | Apache-2.0 | What Claude Code and Codex terminal screens look like when working, waiting or idle                            |
| Symphony (OpenAI)           | Apache-2.0 | Stall detection, retry back-off and reconciliation rules, workspace safety invariants                          |
| hcom, AI Maestro            | MIT        | Delivery and wake-up separated from persistence                                                                |
| nimbalyst, agent-deck       | MIT        | How subscription limits are read (and which approach was rejected for reading credentials)                     |
| claude-squad, agent-teams-ai| AGPL-3.0   | Ideas only; no code                                                                                            |
| MCP Agent Mail, agents-office | custom   | Excluded: licenses that restrict reuse                                                                         |
| multiagents                 | none stated| Ideas only                                                                                                     |

Not every project was read in depth; the report states the scope of each review. None was run as a product, and the comparison
is reasoning from public source and documentation, not a benchmark.
