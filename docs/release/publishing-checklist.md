# Release checklist

[Documentation](../README.md) · [Project](../../README.md)

AETHER OFFICE is published at [haotool/aether-office](https://github.com/haotool/aether-office).
Routine releases use the protected `main` branch and preserve public history. Repository creation and history cleanup
are separate operations; the historical procedure is in [History cleanup](history-cleanup.md).

## Prepare the change

- [ ] Update the version in the root `package.json` and all seven workspace manifests. Runtime services read
      `APP_VERSION` from the root; `tests/aether/version.test.ts` checks consistency. Update the sidebar's major/minor
      badge only when that series changes.
- [ ] Move the completed changes from `Unreleased` into a dated version section in [CHANGELOG.md](../../CHANGELOG.md).
      Include upgrade steps when behavior or configuration changes. Keep earlier release entries intact.
- [ ] Review the [feature ledger](../verification/report.md). Implementation and verification are separate; missing
      provider, platform, device or human evidence remains an open blocker.
- [ ] Check the [provider compatibility contracts](../provider-compatibility.md). Synthetic tests do not verify a
      real authenticated CLI or paid model. Run those integrations only with explicit authorization.
- [ ] Keep private data, local credentials and audit artifacts out of the release. Use `.oss-private-patterns` for
      maintainer-specific scan patterns; never commit that file.

## Validate a clean candidate

Run the repository checks on the candidate commit and retain the results with its SHA and platform:

```sh
pnpm install --frozen-lockfile
pnpm typecheck
pnpm lint
pnpm format:check
pnpm test
pnpm build
pnpm verification:check
node scripts/check-bundle-size.mjs
pnpm run oss:check
pnpm run quality:check
pnpm exec playwright test
pnpm verify:clean
```

- [ ] Run `pnpm run notices:check`. Dependency changes require regenerated notices; verify the build contains
      `LICENSE.txt` and `THIRD_PARTY_NOTICES.txt`.
- [ ] Review upstream attribution in `LICENSE`, `NOTICE`, `REUSE.toml` and [provenance](../legal/provenance.md).
      Adapted code keeps its compatible license and notice. For newly studied reference code, run the overlap scanner
      described in provenance and review every unexplained match.
- [ ] Review the [license inventory](../legal/inventory.md) and [trademark decisions](../legal/trademarks.md).
      The Anthropic agent SDK has separate terms and is not bundled. AETHER OFFICE remains independent of provider brands.
- [ ] Inspect changed UI pages at phone and tablet sizes and run their responsive and accessibility specs. Automated
      axe checks do not replace VoiceOver or TalkBack testing.
- [ ] Record checks that were skipped, failed or unavailable. The quality score excludes some unmeasured rules;
      [release scoring](../quality/README.md#release-mode---release) counts unmeasured criteria as zero.

## Merge through the protected branch

- [ ] Open a focused pull request with the concrete behavior change, validation results and remaining limitations.
      Use a conventional title of at most 72 characters and complete the contribution certification.
- [ ] Confirm the current PR head has successful `check`, `audit`, `commit-messages` and CodeQL runs.
      `check` and `audit` require the Linux/macOS verification matrix; Linux also runs the selected browser workflows.
- [ ] Merge the reviewed head through the ruleset. Do not bypass checks or force-push `main`.
- [ ] Confirm the resulting `main` commit and its CI/CodeQL results. A passing earlier head is not evidence for a changed
      release tree.
- [ ] Run `pnpm verify:clean` from that exact main revision. The complete local browser suite remains a release gate;
      CI's selected workflows cover only part of it.

## Publish the source release

Use the version from `package.json`. For example, a `0.4.1` release uses the tag `v0.4.1`:

```sh
node scripts/oss/third-party-notices.mjs --sbom aether-office-0.4.1.cdx.json
git tag -a v0.4.1 -m "v0.4.1"
git push origin v0.4.1
```

- [ ] Obtain maintainer authorization before pushing or publishing. Create the annotated tag from the verified main
      commit; use a signed tag if a signing key is already configured. Never replace an existing public release tag.
- [ ] Create a GitHub release using the matching changelog section and attach the CycloneDX SBOM. Mark it a pre-release
      while the ledger contains unresolved release blockers.
- [ ] Check the tag's commit, release status, notes and attachment after publication. A source-only release has no
      compiled binary provenance claim: its evidence is the public tag and verified source commit.
- [ ] Follow the README from a fresh checkout. Preserve verification records and a recoverable snapshot before
      archiving the task's temporary worktree.

## Repository administration

These settings are reviewed separately from routine releases:

- Require PRs, the existing status checks and linear history on `main`; block force pushes and deletion. Keep
  `.github/CODEOWNERS` current. Require an approving Code Owner once a second maintainer can review the first's changes.
- Use read-only Actions permissions and approvals for first-time contributors. Keep Actions pinned to commit SHAs.
- Enable private vulnerability reporting, secret scanning, push protection and Dependabot security updates where
  available. Confirm the repository offers **Report a vulnerability** and the issue templates load.
- Old pull-request refs can survive a public-history rewrite. Removing them requires GitHub Support; do not repeat a
  main-branch rewrite or claim those refs are gone without confirmation.

Real iPhone/Android performance reports, VoiceOver/TalkBack journeys and independent release scoring remain separate
acceptance evidence. Follow [mobile measurement](../quality/mobile-perf.md) and the verification ledger; publishing a
pre-release does not close those gates.
