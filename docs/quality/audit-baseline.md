# Release audit: baseline

Measured on 2026-10-08 at commit `34a9990` (branch `aether/product`, 666 commits), in a fresh worktree after
`pnpm install --frozen-lockfile`. Node 24.21.0, pnpm 12.8.1, macOS arm64. The machine was busy (load average 4 to 8), so
the durations are indicative only. This file records where the audit started; `audit-report.md` records where it ended.

## Gates

| Gate                            | Exit | Time | Result                                                                                           |
| ------------------------------- | ---: | ---: | ------------------------------------------------------------------------------------------------ |
| `pnpm typecheck`                |    0 |   2s |                                                                                                  |
| `pnpm lint`                     |    0 |   1s | boundaries and design tokens                                                                     |
| `pnpm format:check`             |    0 |   6s |                                                                                                  |
| `pnpm test`                     |    1 |  37s | 2,617 passed, 1 failed, 1 skipped (302 files); see finding 1                                     |
| `pnpm build`                    |    0 |   7s |                                                                                                  |
| `pnpm verification:check`       |    0 |   0s | ledger of 175 features: 92 implemented and passed, 53 implemented and partial, 30 partial        |
| `pnpm quality`                  |    0 |  13s | overall 94.9 (table below)                                                                       |
| `pnpm run quality:check`        |    1 |  14s | stale scorecard; `perf` 97.9 is below its floor 98.8; see finding 2                              |
| `pnpm run oss:check`            |    0 |   3s | 12 passed, 2 warnings (tracked files over 1 MB, which are the shipped models), 0 failed          |

`pnpm exec playwright test` and the performance matrix were not part of this baseline; they run with their own ports and a
lock, and the machine load made a timing run meaningless.

## Repository quality areas (`pnpm quality`)

| Area      | Score | Floor | Measured | Largest penalty                                          |
| --------- | ----: | ----: | -------: | -------------------------------------------------------- |
| structure |  94.3 |  81.2 |     100% | five files imported by more than 30 others               |
| types     |  96.3 |  85.0 |     100% | 74 non-null assertions                                   |
| tests     | 100.0 | 100.0 |      82% |                                                          |
| ui        |  97.5 |  97.5 |      82% | 151 escape comments                                      |
| a11y      |  87.2 |  77.2 |      80% | 96 inline bilingual strings that belong in locale tables |
| perf      |  97.9 |  98.8 |      70% | first load is 207 KB (budget 200 KB)                     |
| docs      | 100.0 | 100.0 |     100% |                                                          |
| security  | 100.0 | 100.0 |     100% |                                                          |
| oss       |  95.0 |  95.0 |     100% | version is still `0.4.0-dev.0`                           |
| maturity  |  80.6 |  80.6 |      60% | ledger maturity 83.86                                    |

The "Measured" column is the share of rules the scorer could evaluate. A rule it cannot evaluate is left out of the
average, so a high score here says little about the areas that are not measured.

## Findings

1. **`pnpm test` depends on the machine.** `tests/aether/provider-compat.test.ts` runs the installed `codex` and `claude`
   binaries and requires their versions to be in `packages/providers/generated/compat.json`. The check is skipped when a CLI
   is absent, but it fails when one is present at an unverified version (here `codex-cli 0.161.0`; the verified list is
   0.159.2, 0.160.0 and 0.160.1). A contributor with a newer CLI sees a red suite that has nothing to do with their change.
   The verified list was not extended: no run against 0.161.0 backs it.
2. **The committed scorecard is stale.** `docs/quality/scorecard.json` and `scorecard.md` disagree with the current tree
   (first load 204 KB committed, 207 KB now; total JS 823 KB committed, 834 KB now).
3. **The reference tree is not part of the repository.** A local `.research/` directory of public reference clones
   (2.9 GB) sat in the working directory. It is ignored by git and was moved out of the directory.
4. **Local branches and stashes had piled up** (32 merged agent branches, 2 stashes) in the maintainer's working copy. They
   are not part of the published history.

## Not yet measured by tooling

The audit's nine layers are scored from more criteria than `pnpm quality` evaluates: cognitive complexity, directory size,
coverage, per-feature tests, history hygiene, community files, workflow hardening and others. Until a scorer covers them
they count as unmeasured, which scores zero.
