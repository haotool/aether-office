# Development

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
fixtures/         Synthetic provider processes used by tests and the demo
scripts/          Build, setup, doctor, hook CLI and the checks CI runs
docs/             This documentation, ADRs and the verification ledger
```

## Commands

| Command                       | What it does                                                                             |
| ----------------------------- | ---------------------------------------------------------------------------------------- |
| `pnpm install --frozen-lockfile` | Installs exactly the locked dependencies                                              |
| `pnpm dev` / `pnpm demo`      | Runs control, runner and web with live or fixture data                                   |
| `pnpm build`                  | Builds control, runner and web (the build also pre-compresses assets)                    |
| `pnpm start`                  | Runs the built control plane                                                             |
| `pnpm typecheck`              | `tsc --noEmit` over apps, packages, tests and scripts                                    |
| `pnpm lint`                   | Module boundaries (`scripts/check-boundaries.mjs`) and design tokens (`scripts/check-design-tokens.mjs`) |
| `pnpm format` / `format:check`| Prettier                                                                                 |
| `pnpm test`                   | Vitest (`tests/aether`); `test:unit`, `test:integration` and `test:security` run one file each |
| `pnpm exec playwright test`   | End-to-end suite in Chrome                                                               |
| `pnpm run setup`              | Creates the data directory and the owner token (`--demo` for the demo's)                   |
| `pnpm hooks <install\|remove\|status>` | Installs, removes or reports the Claude Code or Codex hooks (see [getting started](getting-started.md#exact-activity-with-hooks-optional)) |
| `pnpm run pair` / `pnpm runner:enroll` | Prints a phone-pairing QR code / enrolls a runner with a one-time invitation                |
| `pnpm run doctor`             | Reports OS, Node, pnpm, Git and provider CLI versions and what is missing                |
| `pnpm verification:report` / `verification:check` | Regenerate / check the verification report from the ledger           |
| `node scripts/audit-dependencies.mjs [package...]` | Reads the registry metadata of the dev dependencies (network) for the dependency ledger entry |
| `pnpm audit:deps`             | `pnpm audit` for high-severity advisories                                                |
| `pnpm verify:clean`           | Clean-room install, build and test of the committed tree                                 |
| `pnpm backup`                 | Create or restore a backup of the control plane's data                                   |
| `pnpm run oss:check`          | Publishing-readiness scan of the tree (`--history` adds the history); see [release](release/history-cleanup.md) |
| `pnpm smoke:live`             | Real Claude/Codex smoke test; consumes subscription quota, needs `--confirm-subscription-quota` |

## Testing

- **Real systems, not mocks.** Integration tests use real SQLite, real Git repositories, real HTTP and a real browser.
  Providers are replaced by clearly labeled synthetic processes (`fixtures/processes`), and a synthetic provider is never
  reported as live evidence.
- **Test first.** New behavior starts with a failing test; a bug fix starts with a regression test.
- **Timing-sensitive suites** (PTY, Git, MCP) run with bounded parallelism (`maxWorkers: 4`). If one times out on a heavily
  loaded machine, re-run it alone before suspecting a bug.
- **End to end.** `e2e/` starts real control and runner processes with an isolated data directory. It covers the full
  journey (sign in, create and assign work, review, verify, accept), accessibility (axe), responsive layout at six sizes,
  touch flows and the 3D scene.

## Verification ledger

[`docs/verification/features.json`](verification/features.json) lists each capability with an **implementation** status and
an independent **verification** status, the tests that back it and what blocks the rest. `docs/verification/report.md` is
generated from it (`pnpm verification:report`) and checked by a test, so the report can never claim more than the ledger.
The original acceptance statements are in Traditional Chinese. A green build is not a claim of production readiness.

## Database changes

Add a numbered SQL file to `apps/control/src/db/migrations` (never edit an applied one; checksums are recorded). Update the
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
blender --background --factory-startup --python tools/blender/audit_animals.py -- --samples 12

# Render each animal seated from front, side and back for a visual review
blender --background --factory-startup --python tools/blender/render_review.py -- --out /tmp/review

node scripts/optimize-animals.mjs    # drops animation keyframes a straight line can stand in for (-30% download); once per rebuild
node scripts/validate-assets.mjs     # checks the shipped models and textures against their manifests
```

The furniture's dimensions live in one file, `packages/office-scene/src/desk-seating.json`, shared by the scene and the
audit, so a character is checked against the chair and desk it is really given. Change an animation, a proportion or the
desk, run the audit (it must report no clipping), rebuild the models and validate them.

## Contact sheets and GPU perf

Both gates look at a running build (`pnpm build`, then the e2e server or `pnpm demo`), never at a mock.

```sh
# One labelled PNG per category (scene, life) from real browser screenshots; --gpu uses Chrome on the real GPU (ANGLE Metal)
node scripts/contact-sheet.mjs --url http://127.0.0.1:4320 --out evidence/contact-sheets --gpu
node scripts/contact-sheet.mjs --category life --effects rubber-duck,ci-lamp --times 0,1000,2000   # via ?preview=life&effect=<id>&t=<ms>

# Baseline vs variant scene through the perf probe, interleaved and repeated, on the real GPU
PERF_GPU=1 PERF_VARIANT='preview=life&effect=rubber-duck' pnpm exec playwright test e2e/office-life-perf.spec.ts
```

The sheets are for a human to review (a pixel diff belongs on the real-GPU runner only). The perf spec writes
`evidence/office-life-perf.json` with the deltas of [the office-life gates](design/office-life.md#10-tests-and-gates) (median and
p95 frame time, draw calls, programs, GPU MB, CPU ms per frame), the renderer that produced them and the number of runs; it
refuses a software renderer. Without `PERF_GPU=1` it is skipped, which is "not run", never "passed". A frame time is capped
by the display's refresh (16.7 ms at 60 Hz), so judge small deltas by `jsMs` and the draw and program counts, and repeat on a
loaded machine (`PERF_ROUNDS`).

## Releasing

There is no release process yet; the project is pre-release. Before one: run `pnpm verify:clean`, review the verification
ledger, produce a software bill of materials and re-check [THIRD_PARTY_NOTICES.md](../THIRD_PARTY_NOTICES.md). The steps
to publish, including cleaning the history, are in the [publishing checklist](release/publishing-checklist.md).
