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
| `pnpm lint`                   | Module boundaries and design tokens                                                      |
| `pnpm format` / `format:check`| Prettier                                                                                 |
| `pnpm test`                   | Vitest (`tests/aether`)                                                                  |
| `pnpm exec playwright test`   | End-to-end suite in Chrome                                                               |
| `pnpm run doctor`             | Reports OS, Node, pnpm, Git and provider CLI versions and what is missing                |
| `pnpm verification:report` / `verification:check` | Regenerate / check the verification report from the ledger           |
| `pnpm audit:deps`             | `pnpm audit` for high-severity advisories                                                |
| `pnpm verify:clean`           | Clean-room install, build and test of the committed tree                                 |
| `pnpm backup`                 | Create or restore a backup of the control plane's data                                   |
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

## Releasing

There is no release process yet; the project is pre-release. Before one: run `pnpm verify:clean`, review the verification
ledger, produce a software bill of materials and re-check [THIRD_PARTY_NOTICES.md](../THIRD_PARTY_NOTICES.md).
