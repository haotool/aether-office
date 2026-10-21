# Contributing to AETHER OFFICE

[Documentation](../docs/README.md) · [Project](../README.md)

Thank you for considering a contribution. This document explains how to set up the project, what a good change looks
like and how it is reviewed.

By participating you agree to the [Code of Conduct](CODE_OF_CONDUCT.md). Report security problems privately, as
described in [SECURITY.md](SECURITY.md), never in a public issue.

## Getting set up

Requirements: Node.js **24.21.0** (see `.nvmrc`) and the pnpm version pinned in `package.json`.

```sh
pnpm install --frozen-lockfile
pnpm build
pnpm demo          # control plane, runner and web UI with fixture data; no paid model is called
```

pnpm has built-in `setup` and `doctor` commands that shadow package scripts of the same name; run this project's
scripts as `pnpm run setup` and `pnpm run doctor`.

Blender 5.2 is needed only to change the animals (see [development](../docs/development.md#the-animals)).

## Before you open a pull request

Run the source checks and the full browser suite (see [development](../docs/development.md#testing)):

```sh
pnpm typecheck
pnpm lint            # module boundaries and design tokens
pnpm format:check    # pnpm format fixes it
pnpm test
pnpm build
pnpm verification:check   # the verification ledger is consistent
node scripts/check-bundle-size.mjs   # after the build
pnpm run oss:check   # notices, licences, readiness (after the build)
pnpm run quality:check   # the quality scorecard is current and no area is below its floor (after the build)
pnpm exec playwright test
```

CI runs the source checks on Linux and macOS, selected Linux browser workflows, and `pnpm audit:gate`
(fail-closed high/critical advisories; needs the network). The complete browser suite remains a local release gate.

A change is ready when:

1. **It is small and focused.** One concern per pull request. Unrelated clean-ups go in their own.
2. **It has tests.** New behaviour gets a failing test first; a bug fix gets a regression test. Tests use real
   SQLite, Git, HTTP and browsers rather than mocks of them (see [development](../docs/development.md#testing)).
3. **It keeps the boundaries.** `packages/kernel` has no transport, database or UI imports; the runner never writes the
   control database; the web app has no Node imports. `pnpm lint` enforces these.
4. **UI changes follow the [design system](../docs/design-system.md).** Values come from `apps/web/src/styles/core/tokens.css`;
   the responsive and accessibility specs pass; the changed pages were looked at on a phone and a tablet.
5. **It says what was and was not verified.** Capabilities are tracked in
   [`docs/verification/features.json`](../docs/verification/features.json): implementation and verification are separate
   fields, and a check that was not run is not marked passed.
6. **It does not weaken a safety property** (see [security](../docs/security.md)) without an explicit discussion first.

### Raising the floor

`pnpm run quality` scores ten areas from measurable rules ([rubric](../docs/quality/README.md)). Each area has a floor in
`docs/quality/floors.json` that only goes up. After a change that improves a score (fewer long functions, a fixed doc link, a
token instead of a literal), run `pnpm run quality:report`, which rewrites `docs/quality/scorecard.{md,json}` and raises the
floors, and commit those files with the change. `pnpm run quality -- --target 95` lists what still stops each area from
reaching 95, with the exact files and lines. A change that makes a score worse fails `quality:check` until it is fixed; do not
lower a floor to get a pull request through. A floor that is genuinely unreachable (a measurement the tested platform can no longer take, say) is lowered in its own change and written down under "Lowered floors" in the [rubric](../docs/quality/README.md), with what has to be true to raise it again. If a rule is wrong, change the rule, its test and the rubric in the same pull request.

### Code only shrinks

`structure` caps the lines of ts, tsx, mjs and css files (`LIMITS.codeLines` in `scripts/quality/areas/structure.mjs`). A change
that adds lines removes at least as many elsewhere, otherwise `quality:check` fails. When code shrinks, lower the budget to the new
total; never raise it. Comments count against it: write none by default and keep only a one or two line English comment that says
why (an invariant, an ordering or race, a platform quirk, a security reason, an issue link), besides tool pragmas.

## Commit messages and pull requests

Use the form `type: subject` or `type(scope): subject`:

- **type** is one of `feat`, `fix`, `refactor`, `perf`, `docs`, `test`, `chore`, `ci`, `build`, `style`, `revert`;
- **subject** is in the imperative or a plain description, at most **72 characters**, with no trailing period;
- a longer explanation goes in the **body**, after a blank line, wrapped at about 72 columns: what changed and why, not a
  list of files.

```text
fix(control): refuse a pairing code that was already redeemed

The code was removed after the session was created, so two phones scanning the
same QR code within one tick could both sign in. Remove it first and test both.
```

A pull request title follows the same rule, because it becomes the subject when the change is squash-merged. CI checks the
title and the commit subjects of a pull request (`scripts/oss/commit-msg.sh`). To check your own commits as you write them:

```sh
ln -s ../../scripts/oss/commit-msg.sh .git/hooks/commit-msg
```

Leave AI-tool trailers (`Co-Authored-By: Claude <noreply@anthropic.com>`, session links) out of commit messages and out of the
message of a squash merge: the history is kept free of them, and `pnpm run oss:check --history` warns about each one. Human
co-authors stay.

Describe in the pull request what you ran, on which platform, and anything you could not test.

Maintainers preparing a release should read [Cleaning the history before publishing](../docs/release/history-cleanup.md) and
the [publishing checklist](../docs/release/publishing-checklist.md); `pnpm run oss:check` runs the publishing-readiness
checks.

## Reporting bugs and proposing features

Use the issue templates. A good bug report has the version or commit, the platform, the exact steps and what you
expected. For a feature, describe the problem first; a design discussion before code saves everyone time.

## Licensing

By contributing you agree that your contribution is licensed under the [MIT License](../LICENSE). Certify the
[Developer Certificate of Origin](https://developercertificate.org/) in the pull request checklist: you wrote the change
or have the right to submit it under that license. This keeps the certification with the review while preserving the
project's clean commit-message convention.

Do not paste code from projects with incompatible licenses (GPL, AGPL, source-available or non-commercial terms), and do not
commit code an AI assistant reproduced from such a project; take the idea and write the code. Where you adapt code under a
compatible license, keep its notice and record it as the [licence policy](../docs/legal/licence-policy.md#code-from-other-projects)
describes. A new dependency must have an approved license: run `pnpm run notices` and commit the regenerated
`THIRD_PARTY_NOTICES.md` (CI checks it).
