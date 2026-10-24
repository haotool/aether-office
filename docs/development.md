# Development

[Documentation](README.md) · [Project](../README.md)

<details>
<summary>Contents</summary>

- [Repository layout](#repository-layout)
- [Commands](#commands)
- [Testing](#testing)
- [Writing stable tests](#writing-stable-tests)
- [Verification ledger](#verification-ledger)
- [Database changes](#database-changes)
- [Adding a capability](#adding-a-capability)
- [The animals](#the-animals)
- [Contact sheets and GPU perf](#contact-sheets-and-gpu-perf)
- [Releasing](#releasing)

</details>

## Repository layout

```
apps/
  control/        Fastify + SQLite control plane (routes/, services/, db/migrations/)
  runner/         Agent supervisor: worktrees, PTY, observers, MCP server, journal
  web/            React app (src/features, src/styles, src/locales)
packages/
  contracts/      Zod schemas and shared types
  kernel/         Pure domain logic (authorization, transitions, schedules, terminal state)
  providers/      Claude Code, Codex and ACP adapters; generated Codex protocol types
  office-scene/   The 3D office
tools/blender/    Builds, audits and renders the animals
assets-source/    Baked texture maps the shipped models are checked against
e2e/              Playwright specs (real control plane, runner and browser)
tests/aether/     Vitest unit, integration and security tests
tests/processes/  Synthetic provider processes the tests and e2e run instead of real CLIs
scripts/          Build, setup, doctor, hook CLI and the checks CI runs
docs/             This documentation, ADRs and the verification ledger
```

## Commands

| Command                                                      | What it does                                                                                                                                                                                                           |
| ------------------------------------------------------------ | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `pnpm install --frozen-lockfile`                             | Installs exactly the locked dependencies                                                                                                                                                                               |
| `pnpm dev` / `pnpm demo`                                     | Runs control, runner and web with live or fixture data                                                                                                                                                                 |
| `pnpm build`                                                 | Builds control, runner and web (the build also pre-compresses assets)                                                                                                                                                  |
| `pnpm start`                                                 | Runs the built control plane                                                                                                                                                                                           |
| `pnpm typecheck`                                             | `tsc --noEmit` over apps, packages, tests and scripts                                                                                                                                                                  |
| `pnpm lint`                                                  | Module boundaries (`scripts/check-boundaries.mjs`) and design tokens (`scripts/check-design-tokens.mjs`)                                                                                                               |
| `pnpm format` / `format:check`                               | Prettier                                                                                                                                                                                                               |
| `pnpm test`                                                  | Vitest (`tests/aether`); default run excludes host CLI drift checks (see [Provider CLI version tests](#provider-cli-version-tests)); `test:unit`, `test:integration` and `test:security` run one file each             |
| `pnpm test:host-clis`                                        | Host CLI drift alarm: version checks against **installed** `codex` and `claude` on `PATH` (requires `AETHER_HOST_CLIS=1`; not part of default `pnpm test`); fails on malformed version output, not an unlisted release |
| `pnpm test:coverage`                                         | Vitest with the v8 coverage provider; writes `coverage/coverage-summary.json` for the quality scorecard                                                                                                                |
| `pnpm exec playwright test`                                  | End-to-end suite in Chrome                                                                                                                                                                                             |
| `pnpm run setup`                                             | Creates the data directory and the owner token (`--demo` for the demo's)                                                                                                                                               |
| `pnpm hooks <install\|remove\|status>`                       | Installs, removes or reports the Claude Code or Codex hooks (see [getting started](getting-started.md#exact-activity-with-hooks-optional))                                                                             |
| `pnpm run pair` / `pnpm runner:enroll`                       | Prints a phone-pairing QR code / enrolls a runner with a one-time invitation                                                                                                                                           |
| `pnpm run doctor`                                            | Reports OS, Node, pnpm, Git and provider CLI versions; `--strict` fails on warnings too                                                                                                                                |
| `pnpm run protocol:regen`                                    | Rewrites the generated Codex protocol types from the installed `codex` of the pinned release and records their digest in `compat.json` (`--check` reports drift, `--digest` prints the digest)                         |
| `pnpm verification:report` / `verification:check`            | Regenerate / check the verification report from the ledger                                                                                                                                                             |
| `node scripts/audit-dependencies.mjs [package...]`           | Reads the registry metadata of the dev dependencies (network) for the dependency ledger entry                                                                                                                          |
| `pnpm audit:gate`                                            | Fail-closed gate for unexempted high/critical advisories                                                                                                                                                               |
| `node scripts/check-bundle-size.mjs`                         | After `pnpm build`: gzip size of the web JavaScript against its budget (CI runs it)                                                                                                                                    |
| `pnpm run quality` / `quality:report` / `quality:check`      | Objective scorecard per area (`--json`, `--area <name>`, `--target 95`); regenerate it and raise the floors / fail on a stale scorecard or an area below its floor; see [quality](quality/README.md)                   |
| `pnpm verify:clean`                                          | Clean-room install, build and test of the committed tree                                                                                                                                                               |
| `node --import tsx scripts/docs-screenshots.mjs --port 4511` | Retakes the README screenshots from a synthetic demo stack (see [images](images/README.md))                                                                                                                            |
| `pnpm backup`                                                | Create or restore a backup of the control plane's data                                                                                                                                                                 |
| `pnpm run oss:check`                                         | Publishing-readiness scan of the tree (`--history` adds the history); see [release](release/history-cleanup.md)                                                                                                        |
| `pnpm smoke:live`                                            | Real Claude/Codex smoke test; consumes subscription quota, needs `--confirm-subscription-quota`                                                                                                                        |

## Testing

### Provider CLI version tests

- **Host drift alarm** — `pnpm test:host-clis` runs only when `AETHER_HOST_CLIS=1` is set; it is not part of default `pnpm test`. It exercises **installed** `codex` and `claude` binaries on `PATH` and fails on malformed version output, not an unlisted release.
- **Real Codex integration** — `tests/aether/codex-real.test.ts` initializes the installed CLI and opens an isolated thread without sending a turn; `claude-real.test.ts` initializes the installed Claude CLI through the SDK without sending a prompt. These skip when the respective CLI is missing. `codex-schema.test.ts` checks generated-reference integrity and compares the entire schema only for its historical byte-identical releases. Schema-wide additions are not runtime compatibility failures.
- **Hermetic policy** — `tests/aether/provider-compat.test.ts` (and `provider-compat.host-clis.test.ts` when opted in) uses fixture `--version` binaries; default `provider-compat` behavior does not depend on host CLI versions.

- **Real systems, not mocks.** Integration tests use real SQLite, real Git repositories, real HTTP and a real browser.
  Providers are replaced by clearly labeled synthetic processes (`tests/processes`), and a synthetic provider is never
  reported as live evidence.
- **Test first.** New behavior starts with a failing test; a bug fix starts with a regression test.
- **Timing-sensitive suites** (PTY, Git, MCP) run with bounded parallelism (`maxWorkers: 4`, a 10 s test timeout). If one times
  out on a heavily loaded machine, re-run it alone (`pnpm exec vitest run tests/aether/<file>.test.ts`) before suspecting a bug.
- **Layers.** Static: `pnpm typecheck` and `pnpm lint` (module boundaries, design tokens). Vitest in `tests/aether` (more than 200
  files): kernel rules, services against real SQLite, HTTP routes, the security matrix and the text pipeline; text sinks and the
  verification ledger are checked here too. Playwright in `e2e/` (about 50 specs): real control plane and runner on ports 4320 and
  4330 (`AETHER_E2E_PORT` and `AETHER_E2E_NATIVE_PORT` give a second checkout or run its own pair; no spec names a port) with a **fixture home** (`playwright.config.ts` points `AETHER_LOCAL_SESSIONS_HOME`, `AETHER_HOOK_SPOOL` and
  `AETHER_CLAUDE_USAGE_FILE` at a temporary directory, so no test reads your real `~/.claude` or `~/.codex`). The e2e specs drive
  Chrome (`channel: 'chrome'`; where `CI` is set, Playwright's own Chromium in its new headless mode, because the headless shell reports notification permission as denied). CI runs the session-discovery, QR-pairing, composer and synthetic native-workflow specs on Linux with Chromium. The full suite, including 3D scenes, remains a local and release gate. Earlier hosted runs failed to discover fixture sessions and timed out; retained failure records are historical evidence, not proof about the current revision. CI artifacts include browser results and failure screenshots. WebKit is opt-in with `AETHER_WEBKIT=1`. GPU measurements (`PERF_GPU=1`) and `pnpm smoke:live`
  are never part of the default run: a skipped check is "not run", never "passed".
- **Keeping tests stable.** Use fixture data with fixed timestamps rather than "now" where you can; synthetic processes
  (`tests/processes`, `sleep` named `claude`) instead of real CLIs; wait on a visible state (`expect(...).toBeVisible()`,
  an element that proves the data arrived) instead of a fixed sleep; never depend on the camera director in a spec (it is off under
  automation); give a spec its own repository and session files so specs do not share state; and keep a test that needs a GPU
  behind its flag.
- **Screenshots** for the README are made by `scripts/docs-screenshots.mjs` ([images](images/README.md)); run it after a visual
  change and look at every image.
- **Stable under load.** See [Writing stable tests](#writing-stable-tests).
- **End to end.** `e2e/` starts real control and runner processes with an isolated data directory. It covers the full
  journey (sign in, create and assign work, review, verify, accept), accessibility (axe), responsive layout at six sizes,
  touch flows and the 3D scene.

### Linux browser fixtures

Automatic project adoption intentionally excludes repositories under `/tmp` and `/private/tmp`. Linux browser tests
therefore need a temporary directory outside those scratch roots. CI sets `TMPDIR` to the runner's temporary directory
for the browser step. For a local Linux run:

```sh
mkdir -p "$HOME/.cache/aether-e2e"
TMPDIR="$HOME/.cache/aether-e2e" pnpm exec playwright test
```

The fixture data stays synthetic and separate from the operator's CLI credentials. This setting changes the test
fixture location; it does not change which repositories the product adopts.

## Writing stable tests

A test passes on a quiet machine and on one at load 30 alike, or it is not finished. Wait for the thing, never for a guess
at how long it takes.

- **No fixed sleeps before an assertion.** Wait for the event or state (`expect(...).toBeVisible()`, `expect.poll`,
  `locator.waitFor`; in Vitest `eventually` from `tests/aether/timing.ts`) with a deadline that only a hang can reach. A wait
  for something to _not_ happen (a banner that must not appear) has to be time-based: keep it short, say so in a comment, and
  never let it stand in for a positive wait. `e2e/support/settled.ts` counts animation frames instead of milliseconds for a
  camera flight (`settled`) or a stretch of scene time (`frames`).
- **Ephemeral ports.** A test that listens takes `freePort()` (`tests/aether/timing.ts`), not a number in the 4000s that
  another suite, another worktree or a running `pnpm dev` may hold. The e2e servers' ports are the launcher's: read them
  from `.data/e2e-session.json` and `nativeOrigin()`, never repeat them in a spec.
- **Signing in is one helper.** `signIn(page, path?)` in `e2e/support/sign-in.ts` fills the token, presses the button and
  returns only once the token field is gone, that is, once the login has answered and the page holds its CSRF token. A
  `page.goto` or reload made before that loses the session's writes.
- **Cleanups tolerate stragglers.** Stop the child processes and wait for them before removing their directory (one
  `afterAll`, in that order: hooks run in reverse), and remove with `rmSync(dir, { recursive: true, force: true, maxRetries: 5 })`.
- **Wall-clock budgets are for performance runs.** A bound on how fast something is (`scan-budget`, a verifier that must be
  killed within a time) is asserted only with `AETHER_TIMING_TESTS=1` (`budget(tight, loose)` in `tests/aether/timing.ts`).
  The default run asserts the behavior with a loose bound that a hang or a missing yield still breaks. Scan cost is also
  guarded by counting, which needs no stopwatch: `scan-work-bound.test.ts` counts the files a scan stats and opens.
- **Prove it under load.** Run the file ten times next to a CPU burner (`yes > /dev/null` four to twenty times, killed by its
  own PID afterwards) before calling a timing fix done, and compare with the same run on the old test.
- **Nothing from the machine.** A test that makes a git commit sets `user.name` and `user.email` itself (`-c user.name=t -c user.email=t@example.com`): a CI runner has no identity, a laptop always does. To see what a runner sees, run the file with `GIT_CONFIG_GLOBAL=/dev/null GIT_CONFIG_NOSYSTEM=1 GIT_CONFIG_COUNT=1 GIT_CONFIG_KEY_0=user.useConfigOnly GIT_CONFIG_VALUE_0=true`.
- **Retries are a net, not a fix.** On a slow or shared machine a few 3D-scene specs can miss a deadline. CI retries a failing
  e2e test twice by default (`AETHER_E2E_RETRIES` sets the count). The Linux browser job sets zero retries so the first
  failure blocks its gate; any run that needed a retry is reported as flaky.
  Treat a flaky test like a failing one: find the missing wait.

## Verification ledger

[`docs/verification/features.json`](verification/features.json) lists each capability with an **implementation** status and
an independent **verification** status, the tests that back it and what blocks the rest. `docs/verification/report.md` is
generated from it (`pnpm verification:report`) and checked by a test, so the report can never claim more than the ledger.
The original acceptance statements are in Traditional Chinese. A green build is not a claim of production readiness.

## Database changes

Add a numbered SQL file to `apps/control/src/db/migrations` (never edit an applied one; checksums are recorded, and an edited one stops the server at start with a message that says so; a
copy of the database, `control.sqlite.pre-migration-*.sqlite`, is made first and the newest three are kept).
Comments and whitespace are part of the checksum too. Eight historical comment-removal variants have an exact compatibility allowlist; do not normalize SQL or rewrite stored checksums to bypass a mismatch. Update the
Zod schemas in `packages/contracts` and add a test that exercises the migration through the service.

## Adding a capability

1. Put pure rules in `packages/kernel` with unit tests.
2. Add the schema to `packages/contracts`.
3. Implement the service in `apps/control/src/services` and a route in `routes/`; authorize through the kernel matrix.
4. If it needs the machine (a process, a file, a PTY), it belongs to the runner, reached through the claim/report protocol.
5. Add the UI as a feature module that composes the shared components ([design system](design-system.md)).
6. Add or update the ledger entry with the tests that verify it.

## The animals

The eight animal characters (fox, rabbit, panda, cat, dog, raccoon, otter, bear), a ghost and a jiangshi are generated, not
hand-modeled. `tools/blender/` is the source; the `.glb` files in `apps/web/public/assets/animals` are output.

```sh
# Rebuild all models (several minutes). The .blend files are written to assets-source/animals but are not tracked.
blender --background --factory-startup --python tools/blender/build_animals.py -- --species all

# Check every seated clip against the desk and chair, and every loop for seams
blender --background --factory-startup --python tools/blender/audit_animals.py -- --samples 32

# Render each animal seated from front, side and back for a visual review
blender --background --factory-startup --python tools/blender/render_review.py -- --out /tmp/review

node scripts/optimize-animals.mjs    # drops animation keyframes a straight line can stand in for (-30% download); once per rebuild
node scripts/validate-assets.mjs     # checks the shipped models and textures against their manifests
```

The furniture's dimensions live in one file, `packages/office-scene/src/desks/desk-seating.json` (the scene reads it typed through
`seating.ts`), shared by the scene and the audit, so a character is checked against the chair and desk it is really given. Change an animation, a proportion or the
desk, run the audit (it must report no clipping), rebuild the models and validate them.

## Contact sheets and GPU perf

Both gates look at a running build (`pnpm build`, then the e2e server or `pnpm demo`), never at a mock.

```sh
# One labelled PNG per category (scene, squad) from real browser screenshots; --gpu uses Chrome on the real GPU (ANGLE Metal)
node scripts/contact-sheet.mjs --url http://127.0.0.1:4320 --out evidence/contact-sheets --gpu
node scripts/contact-sheet.mjs --category squad --gpu   # the squad storyboard on stand-in subagents (?squad=N&arrive=MS&leave=MS&look=1)

# Baseline vs variant scene through the perf probe, interleaved and repeated, on the real GPU
PERF_GPU=1 PERF_BASELINE='squad=8&legacy=1' PERF_VARIANT='squad=8' pnpm exec playwright test --timeout=300000 e2e/office-life/office-life-perf.spec.ts   # 8 subagents in a squad zone against at desks
```

`?squad=3&tokens=12000` gives the stand-in subagents a token rate so the beam and its label follow tokens.

The sheets are for a human to review (a pixel diff belongs on the real-GPU runner only). The perf spec writes
`evidence/office-life-perf.json` with the deltas of [the office-life gates](design/office-life.md#10-tests-and-gates) (median and
p95 frame time, draw calls, programs, GPU MB, CPU ms per frame), the renderer that produced them and the number of runs; it
refuses a software renderer. Without `PERF_GPU=1` it is skipped, which is "not run", never "passed". A frame time is capped
by the display's refresh (16.7 ms at 60 Hz), so judge small deltas by `jsMs` and the draw and program counts, and repeat on a
loaded machine (`PERF_ROUNDS`).

## Releasing

Releases are source-only pre-releases while the verification ledger has open blockers. Follow the
[publishing checklist](release/publishing-checklist.md) to update versions, validate a clean checkout, verify CI at the
exact main commit, and publish an annotated tag with its software bill of materials. Preserve existing public tags.
History cleanup is a separate, explicit maintenance operation; routine releases do not rewrite public history.
