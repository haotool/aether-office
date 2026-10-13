## What and why

<!-- What does this change, and what problem does it solve? Link the issue. -->

## How it was verified

<!-- Describe what you ran, on which platform, and anything you could not test (see CONTRIBUTING.md). -->

- [ ] `pnpm typecheck`, `pnpm lint`, `pnpm format:check`, `pnpm test`, `pnpm build`
- [ ] `pnpm verification:check`
- [ ] `node scripts/check-bundle-size.mjs` (after the build)
- [ ] `pnpm run oss:check` and `pnpm run quality:check` (after the build)
- [ ] `pnpm exec playwright test` (UI or API changes)
- [ ] Tests added or updated for new behaviour or regressions
- [ ] Docs updated (`docs/`, README) where behaviour changed
- [ ] User-visible changes noted for [CHANGELOG.md](../CHANGELOG.md) (or N/A)
- [ ] No safety property weakened (see [docs/security.md](../docs/security.md))
- [ ] New dependencies: approved licence, `pnpm run notices` run and `THIRD_PARTY_NOTICES.md` updated (or N/A)

## Title and commits

The pull request title uses conventional commits (`type` or `type(scope): subject`, ≤72 characters, no trailing
period), matching [CONTRIBUTING.md](CONTRIBUTING.md#commit-messages-and-pull-requests).

- [ ] I certify the [Developer Certificate of Origin](https://developercertificate.org/): I have the right to submit this contribution under the MIT license.
