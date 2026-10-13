# Quality scorecard

[Documentation](../README.md) · [Project](../../README.md)

<details>
<summary>Contents</summary>

- [How a score is computed](#how-a-score-is-computed)
- [The rubric](#the-rubric)
- [Floors and raising them](#floors-and-raising-them)
- [Challenging a rule](#challenging-a-rule)

</details>

A score is only meaningful if it is computed. `pnpm run quality` measures ten areas from rules that can be read and challenged
here, prints the failing rules with the exact files and lines, and `pnpm run quality:report` writes the result to
[scorecard.md](scorecard.md) (for people) and [scorecard.json](scorecard.json) (for tools), like the verification report.

```sh
pnpm build                       # first, so that the bundle budgets are measured
pnpm run quality                 # the table, and the failing rules of every area below its target
pnpm run quality -- --json       # everything, machine readable
pnpm run quality -- --area ui    # one or more areas (structure types tests ui a11y perf docs security oss maturity)
pnpm run quality -- --target 95  # exactly what stops each area from reaching 95
pnpm run quality:report          # regenerate the scorecard and raise the floors
pnpm run quality:check           # CI: fails on a stale scorecard or an area below its floor
pnpm run quality:release         # CHARTER §5 release score (unmeasured criteria = 0 credit)
pnpm run quality:release -- --out release.json
pnpm run quality:release -- --gates gates.json --out release.json
pnpm run quality:gates -- --out gates.json [--only L1-01,L7-01]
```

### Release mode (`--release`)

Release scoring follows OSRC CHARTER §5: **unmeasured = 0** (unlike the area scorecard, which
excludes skipped rules from the denominator). Each criterion row has
`{ id, layer, type, status, value, failAt, credit, source, detail[] }`. Layer scores are `100 ×` the mean credit in that layer
(G failures cap the layer at 80). The overall score is the §5.2 weighted mean. Exit code 1 unless overall ≥ 95, every layer ≥
90, every **G** gate passes, and `unmeasured` is 0.

**G gate results** (`--gates <file>`): JSON schema `aether-quality-gates/1` with
`{ schema, sha, dirty, gates: [{ id, exit, command, startedAt, durationMs }] }`.
`sha` must equal `git rev-parse HEAD`, `dirty` must be `0` (and the working tree must be clean), each `id` must be a **G**
criterion with unique ids and integer `exit` (`0` = pass). **Trust model:** the gates file is accepted evidence only when it was
produced by `pnpm run quality:gates` at the same `HEAD` (do not hand-edit `exit` values—the scorer cannot detect tampering).
Independent evaluators re-run `quality:gates` themselves at release time. Produce the file with
`pnpm run quality:gates -- --out <file>` (command map is SSOT in `scripts/quality/release/gates.mjs`). Missing ids stay
unmeasured; an invalid file sets `gatesError` and keeps every **G** row unmeasured (same pattern as malformed E/H evidence).

**E/H evidence** lives in [criteria-evidence.json](criteria-evidence.json): an array of
`{ id, credit: 0|0.5|1, reviewers, sha, files, note }`. At release time each entry must reference a known criterion id, valid
credit, existing `files`, and a `sha` that is an ancestor of `HEAD`; otherwise that criterion stays unmeasured.

**D9 fan-in allowlist:** a line `fan-in-allow: <repo-relative path>` in `docs/adr/*.md` excludes that file from L2-03 fan-in
violations. At most five declarations repo-wide; invalid or missing paths and excess declarations add L2-03 violations.

| Criterion                                                                                                                                  | Measured by                                                                                                                                                                                                                                     | Producer / notes                                                                                                                                               |
| ------------------------------------------------------------------------------------------------------------------------------------------ | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| L1-02 … L1-09, L2-02, L2-03, L2-06, L3-05, L3-06, L7-03, L7-04                                                                             | Release static measures                                                                                                                                                                                                                         | `scripts/quality/release/measure.mjs`                                                                                                                          |
| L3-03                                                                                                                                      | `coverage/coverage-summary.json` (`pnpm test:coverage`); violations = max(0, 80−line%, 70−branch%) pp; failAt 30                                                                                                                                | Scorer (file absent → unmeasured)                                                                                                                              |
| L3-09                                                                                                                                      | `docs/verification/stability.json`: the whole vitest suite run three times on one tree, stamped with the tree ids of `apps`, `packages` and `tests` (`node scripts/quality/release/stability.mjs`); one violation per test whose result differs | Scorer                                                                                                                                                         |
| L4-03, L4-08                                                                                                                               | `docs/verification/ux-matrix.json`, stamped with the code tree ids (`pnpm run ux:matrix`, `pnpm run ux:summary -- --write`)                                                                                                                     | Scorer; see [the UX matrix](../verification/ux-matrix.md)                                                                                                      |
| L4-05                                                                                                                                      | `quality` UI token lint + escape budget                                                                                                                                                                                                         | Scorer                                                                                                                                                         |
| L4-06                                                                                                                                      | Locale parity + inline bilingual scan                                                                                                                                                                                                           | Scorer                                                                                                                                                         |
| L5-03                                                                                                                                      | `refetchInterval` sites under `apps/web/src`                                                                                                                                                                                                    | Scorer                                                                                                                                                         |
| L5-05, L5-06, L5-09                                                                                                                        | `docs/verification/perf-mobile.json`, stamped with the code tree ids (`pnpm run perf:evidence`, `pnpm run perf:record`)                                                                                                                         | Scorer; see [mobile-perf.md](mobile-perf.md)                                                                                                                   |
| L5-04                                                                                                                                      | All `backdrop-filter` blur and `filter: blur(` sites under `apps/web/src/styles/**`, minus lines marked `/* blur-ok: … */` on the same or previous line (measured harmless); failAt 20                                                          | Scorer                                                                                                                                                         |
| L6-07                                                                                                                                      | Mixed zh/en paragraphs in public `docs/` (excludes research/adr/verification)                                                                                                                                                                   | Scorer                                                                                                                                                         |
| L8-03                                                                                                                                      | Conventional commit subjects of the maintainer's commits (upstream commits are skipped, as in `oss:check --history`)                                                                                                                            | Scorer                                                                                                                                                         |
| L8-05                                                                                                                                      | Distinct maintainer author emails (non-upstream commits)                                                                                                                                                                                        | Scorer                                                                                                                                                         |
| L9-04                                                                                                                                      | `pnpm audit` high/critical                                                                                                                                                                                                                      | Scorer (network failure → unmeasured)                                                                                                                          |
| L1-01, L1-07, L2-01, L2-07, L3-01, L3-02, L3-04, L3-07, L4-01, L4-02, L4-04, L5-01, L6-01, L7-01, L7-02, L7-05, L9-01, L9-02, L9-03, L9-05 | `quality:gates`                                                                                                                                                                                                                                 | Gate executor (run the full set on a clean checkout)                                                                                                           |
| L8-01, L8-02, L8-04, L8-08                                                                                                                 | `quality:gates` in the release clone                                                                                                                                                                                                            | `scripts/oss/history-gate.mjs`; the first three read the record `history-verify.sh --evidence` wrote (`OSS_HISTORY_EVIDENCE`), bound to the checked-out commit |
| L5-02, L5-07                                                                                                                               | Perf report                                                                                                                                                                                                                                     | A gate file may list any **G** id; see `docs/quality/mobile-perf.md`                                                                                           |
| E / H rows                                                                                                                                 | `criteria-evidence.json`                                                                                                                                                                                                                        | Review / human gates work packages                                                                                                                             |

Implementation: `scripts/quality/release/` (registry, measure, gates, evidence). Tests:
`tests/aether/quality-release*.test.ts`, `tests/aether/quality-gates.test.ts`.

### L1-04 cognitive complexity (SonarJS alignment)

L1-04 uses a clean-room cognitive-complexity walk in `scripts/quality/ast-cognitive*.mjs`, aligned
with **SonarJS 4.2.2** (`eslint-plugin-sonarjs`, LGPL) as an external black-box oracle—not vendored
in this repository and not a runtime dependency. Known intentional deltas include nullish coalescing
(`??`), which SonarSource’s white paper ignores but SonarJS does not always treat the same way in
every edge path; our implementation follows the SonarJS oracle on the product tree.

**Invariant (ongoing):** on the product scope the scorer uses (`apps/**`, `packages/**/src`,
`scripts/**` TypeScript, excluding `generated/`), the set of functions with cognitive complexity
**> 15** should match SonarJS’s set (symmetric difference 0). Unit tests in
`tests/aether/quality-cognitive-complexity.test.ts` pin boundary cases of the walk; full-set parity
is verified outside this repository with the black-box oracle below (CI does not run that compare).

**Historical snapshot (not a standing guarantee):** at commit `582f250` (2026-10-08), a black-box
oracle compare on that tree reported about **93.33%** exact per-function match overall and about
**89.56%** on matched functions with complexity ≥ 8. Percentages drift when sources change; do not
treat them as release criteria.

**Reproduce the oracle outside this repo (read-only, no vendoring):**

1. In a directory **outside** the product clone (for example a sibling `oracle-sonarjs/`), run
   `npm ci` from a lockfile that pins `eslint`, `eslint-plugin-sonarjs`, and
   `@typescript-eslint/parser` only—do not add these packages to the product `pnpm-lock.yaml`.
2. Add a flat ESLint config that enables `sonarjs/cognitive-complexity` at threshold `0` for
   `**/*.{ts,tsx}` under the product tree.
3. From the product root, run ESLint with that config and collect `sonarjs/cognitive-complexity`
   messages (black box: do not copy plugin source into the product).
4. Compare to `scripts/quality/ast.mjs` (`analyzeProject` + per-function `cognitive`) on the same
   files; report symmetric difference for the **> 15** sets and optional exact-match rates for
   matched functions.

SonarJS is LGPL; use it only as an external reference, not as a shipped dependency.

The whole run takes about 15 seconds, uses no network and starts no browser. Code is read through the TypeScript compiler API of
the installed `typescript` package (7.x, `typescript/unstable/sync`, which starts the local native compiler); no dependency was added.

## How a score is computed

Every rule has a **weight**, a **limit**, a **value** measured from the repository and a **full** excess. The penalty is
`weight x min(1, excess / full)`, where `excess` is how far the value is past its limit (below its minimum, for `>=` rules). An area scores
**100 minus the penalties of its rules**. The weights and limits are in `scripts/quality/areas/*.mjs`, one file per area; change one
there and the rubric below must change in the same commit.

- A rule that needs something absent (a build, a recorded browser run, a GPU, a binary) is **not run**: it costs nothing, and its area
  reports how much of its weight was measured. An area with under half its weight measured is **n/a** (no number, no floor check).
- `info` rules are reported and never penalised.
- The overall score is the mean of the scored areas.
- Files never judged: generated and ledger files (`THIRD_PARTY_NOTICES.md`, `docs/verification/features.json` and `report.md`, the scorecard
  itself, `generated/` folders), lockfiles, binaries and `tests/processes/`. The scorer's own files are skipped by the text scans (they name the patterns).

## The rubric

| Area (id)                             | Rules (weight)                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                |
| ------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Structure (`structure`)               | files over 400 lines (8) and over 800 (12), counting ts, tsx, mjs and css; functions over 50 lines (12); control-flow nesting over 4 (8); import cycles over runtime imports (12); files imported by more than 30 others, `index.ts` barrels excepted (5); exports no file imports, followed through barrels (10); code lines over the budget in `LIMITS.codeLines`, which only goes down (6); duplicated code over 3% of product lines, by a 50-token window with comments and imports ignored (12); `any` (6); `@ts-ignore`, `@ts-expect-error`, `eslint-disable` (6); TODO, FIXME, HACK in comments (5); `console.*` in product source (5) |
| Types and correctness gates (`types`) | `strict`, `noUncheckedIndexedAccess`, `noUnusedLocals` on (20); `noImplicitReturns`, `noFallthroughCasesInSwitch`, `noImplicitOverride`, `noUnusedParameters` (6); TypeScript files outside the type-checked project (6); `tsc --noEmit` errors (20); boundary violations (10); files prettier would change (8); non-null assertions (15); `as unknown as` (10)                                                                                                                                                                                                                                                                               |
| Tests (`tests`)                       | product modules no unit test reaches through imports (25); share imported directly by a test, resolved through barrels, at least 60% (15); fixed sleeps, fixed ports, `waitForTimeout` (20); skipped or todo tests, where `test.skip(condition, reason)` is a guard and not counted (10); line coverage at least 80% (8) and branches at least 70% (7), read from `coverage/coverage-summary.json` when a vitest coverage run left one, else not run (the v8 provider is not installed and none is added). The test-to-source line ratio per package is reported                                                                              |
| UI system (`ui`)                      | the existing token lint (20); literal px width, height, min, max, inset (10); `vh` (5); `@media` widths outside 500, 760, 1000, 1250 and their one-pixel partners (5); literal transition and animation seconds (5); literal shadows (5); literal `line-height` (5); `!important` (5); px custom properties outside `tokens.css` (5); rules above `scripts/design-token-baseline.json` when it exists (15); distinct sizes per role from `e2e/ui/role-variance.spec.ts` (20, see below). Physical left/right properties are reported only                                                                                                     |
| Accessibility and i18n (`a11y`)       | missing keys between each en/zh pair of tables in `apps/web/src/locales` (25); inline bilingual strings (20) and files above `tests/aether/inline-i18n-baseline.json` (10); disabled controls with no `title`, `aria-describedby`, `aria-label`, `whyNot` or a spread `why` object made by it (heuristic, 10); `<img>` without `alt` (5); clickable `div`/`span` without role, key handler or tab stop (heuristic, 10); axe violations (20, see below)                                                                                                                                                                                        |
| Performance budgets (`perf`)          | total web JavaScript gzip against `TOTAL_BUDGET_KB` of `scripts/check-bundle-size.mjs` (25); largest chunk against `CHUNK_BUDGET_KB` (15); first-load JavaScript and CSS of `dist/index.html`, as transferred (the `.br` the build writes) plus the larger of the two language tables, which `main.tsx` awaits before the first render, against 200 KB, which is the 186 KB of the phone budget in `docs/design-system.md` plus headroom (30); frame time and draw cost from `scripts/perf-matrix.mjs` need a real GPU and are always "not run" (30). CSS file count and size are reported (no CSS budget is documented)                      |
| Docs truth (`docs`)                   | markdown links that do not resolve, from the `oss:check` link check (20); `pnpm <command>` in code spans and blocks that is not a script or a pnpm built-in (20); `AETHER_*` names no code reads (15); backticked repository paths that do not exist (20); required documents (5); verification ledger and report (12); `THIRD_PARTY_NOTICES.md` fresh (8). `docs/research`, `docs/adr`, `docs/verification` and the changelog describe history and are not held to the existence rules                                                                                                                                                       |
| Security and privacy (`security`)     | gitleaks on the tree, "not run" without the binary (25); token patterns in tracked files (20); network calls from `apps/web/src` and `packages/office-scene/src` to another origin (20); `PUBLIC_ROUTES` with no inline or `docs/security.md` credential (10); `PUBLIC_ROUTES` whose route file shows no rate limit (`*_RATE_LIMIT`, 429, `attempts`) (15); a test of the trust-proxy setting (5); tracked build output or key material (5)                                                                                                                                                                                                   |
| Open-source readiness (`oss`)         | required community files (15); issue and PR templates, CODEOWNERS, dependabot (5); `.gitignore` and untracked files (10); licence problems (10); REUSE coverage (10); personal home paths and host names in tracked files (20); local host names and LAN addresses in documentation (5); one version across the workspace and not hard-coded (5); a `-dev` version (5). The numbered blockers of `docs/internal/oss-risk-assessment.md` are listed as "open decisions" and not penalised                                                                                                                                                      |
| Product maturity (`maturity`)         | mean ledger entry in `docs/verification/features.json` (60): implemented and passed is 100, implemented and partial 75, partial and partial 50; per-feature scores from `docs/quality/maturity.json` (40, see below)                                                                                                                                                                                                                                                                                                                                                                                                                          |

### Inputs a later run can record

Rules that need a run this scorer will not start read a file the run leaves behind. Until the file exists the rule is "not run".

- `evidence/role-variance.json`: `{ "violations": [{ "page": "kpi", "viewport": "390x844", "role": "button", "distinct": 5, "max": 3 }] }`.
- `evidence/axe-results.json`: `{ "violations": [{ "id": "color-contrast", "help": "..." }] }`.
- `coverage/coverage-summary.json`: the `json-summary` reporter of a vitest coverage run.
- `docs/quality/maturity.json`: `{ "source": "feature maturity audit 2026-10", "features": [{ "id": "kpi", "score": 82, "note": "no empty state" }] }`
  with scores from 0 to 100. A malformed file stops the run with a message.
- `scripts/design-token-baseline.json`: `{ "literal-size": 228, "literal-duration": 28 }` (rule ids of the UI area, counts the repository is
  allowed to have today). A rule above its baseline is a regression and costs the "baseline" rule; the absolute counts always cost their own rules.

## Floors and raising them

`floors.json` holds a floor per area, starting at the score of the first committed run, and a `target` of 95. `quality:check` fails when an
area is below its floor; `quality:report` raises a floor to the area's new score and never lowers one. Lowering a floor is a visible edit of
that file. `quality:check` also fails when `scorecard.json` is stale: a rule that was measured on both sides must have the same value and
penalty (a rule that was not run on either side is ignored, so a machine without gitleaks or a build still checks the rest), and
`scorecard.md` must be exactly what `scorecard.json` renders. See "Raising the floor" in [CONTRIBUTING.md](../../.github/CONTRIBUTING.md).

### Lowered floors

A floor is lowered only in a change of its own that adds a line here: the area, the old and the new floor, the date, why the old one cannot be held and what has to be true to raise it again.

## Challenging a rule

A rule is wrong when it penalises something the project does on purpose, or misses something it should not allow. Open an issue or a pull
request that changes the rule in `scripts/quality/areas/<area>.mjs`, its tests in `tests/aether/quality-score-*.test.ts` and this table,
and regenerate the scorecard. Known limits: the dead-export analysis is by name over resolved imports (a name used only through a string
or a computed key counts as unused); the clone detector matches exact tokens, not renamed copies; `.mjs` files are read for size and text
patterns but not parsed; the accessibility rules are heuristics over JSX text, not a browser.
