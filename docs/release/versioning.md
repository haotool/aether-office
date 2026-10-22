# Version policy

[Documentation](../README.md) · [Project](../../README.md)

AETHER OFFICE is one source-distributed application. The root `package.json` is its version source; the private workspace
manifests carry the same value so tools report one product version. Releases use `vX.Y.Z` annotated tags and follow
[Semantic Versioning 2.0.0](https://semver.org/spec/v2.0.0.html) with the pre-1.0 rules below. The changelog follows
[Keep a Changelog 1.1.0](https://keepachangelog.com/en/1.1.0/); commit and pull request titles follow
[Conventional Commits 1.0.0](https://www.conventionalcommits.org/en/v1.0.0/).

## Compatibility surface

The user-facing contract includes CLI commands, environment variables, configuration files, HTTP and agent-protocol
messages, hook files, persisted database migrations, layouts and browser preferences. The `@aether/*` workspace packages
are private implementation details. A surface explicitly labelled experimental may change under the pre-1.0 policy, but
the changelog still describes the change and its upgrade steps.

## Before 1.0

- Patch (`0.4.Z`): compatible fixes, security hardening, documentation and internal performance work.
- Minor (`0.Y.0`): new user-facing capability or a documented compatibility change that needs an upgrade step.
- Major (`1.0.0`): the compatibility surface becomes stable and the stable-release evidence gates are satisfied.

Semantic Versioning leaves `0.y.z` open: anything may change. This policy narrows that: a breaking change raises the
minor version, never only the patch.

## Choosing the version

A pull request that changes behavior writes its own entry under `Unreleased` in [CHANGELOG.md](../../CHANGELOG.md). The
headings that hold entries when the release is cut decide the increment:

| Entries under `Unreleased`                                                                   | Increment |
| -------------------------------------------------------------------------------------------- | --------- |
| `Added`, `Deprecated`, `Removed`, or a `Changed` entry that needs an upgrade step            | minor     |
| Only `Fixed`, `Security`, or `Changed` entries that need no upgrade step                     | patch     |
| The compatibility surface becomes stable and the stable-release evidence gates are satisfied | `1.0.0`   |

Commit types are inputs, not the decision: `fix`, `perf`, `refactor`, `docs`, `test`, `chore` and `ci` normally mean
patch and `feat` normally means minor, while a maintainer reviews configuration, persistence and protocol effects
before choosing. Dependency updates (`chore(deps)`) do not choose a version by themselves; the changelog lists one only
when it fixes an advisory (`Security`) or changes behavior.

How other projects decide, and what this policy takes from each:

| Source                                                                                             | How the bump is chosen                                                                                                                                                    | Taken here                                                                             |
| -------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | -------------------------------------------------------------------------------------- |
| [Conventional Commits](https://www.conventionalcommits.org/en/v1.0.0/#specification)               | `fix` is a patch, `feat` a minor, a breaking change a major                                                                                                               | Commit types as an input, reviewed by the maintainer                                   |
| [release-please](https://github.com/googleapis/release-please/blob/main/docs/manifest-releaser.md) | Derived from commits; `bump-minor-pre-major` makes a breaking change bump the minor and `bump-patch-for-minor-pre-major` makes a feature bump the patch while below 1.0.0 | A breaking change bumps the minor before 1.0; features stay minor                      |
| [Changesets](https://github.com/changesets/changesets/blob/main/docs/detailed-explanation.md)      | A contributor adds a change file naming the bump and the changelog text; versioning applies the highest bump                                                              | The changelog entry written in the pull request is that file, without extra tooling    |
| [semantic-release](https://github.com/semantic-release/semantic-release)                           | Fully automated from commit messages, including publishing                                                                                                                | Not used: a source release needs the verification evidence and a maintainer's decision |

## Release identity

Work accumulates under `Unreleased`. A release commit moves those entries into a dated version section. The annotated tag,
root and workspace versions, changelog heading and compare links must agree, and the tag must point at the clean, verified
`main` commit. Published tags and release assets are not replaced; a correction receives a new version. A version section without a tag
is not released yet: entries that land before the tag join it, and its date is the day the tag is cut.

## Withdrawing a release

A published tag is never moved. A release is withdrawn only when its tag would keep content that must not stay
public, for example commits whose metadata are rewritten. The release and then its tag are deleted. GitHub
[never lets a tag name used by an immutable release be reused](https://docs.github.com/en/code-security/concepts/supply-chain-security/immutable-releases),
so the next patch version carries the withdrawn version's changes and its changelog section names the version it
replaces. `0.4.1` was withdrawn this way on 2026-10-22; see
[Rewriting after publication](history-cleanup.md#rewriting-after-publication).

## Keeping the release files in step

Each fact has one source, and a check that runs in CI fails when another file disagrees with it:

| Fact                                              | Source                                           | Check                                                                                            |
| ------------------------------------------------- | ------------------------------------------------ | ------------------------------------------------------------------------------------------------ |
| Product version                                   | Root `package.json`                              | `tests/aether/version.test.ts`: workspace manifests, sources, sidebar badge                      |
| Changelog layout, released version, compare links | [CHANGELOG.md](../../CHANGELOG.md)               | `tests/aether/quality-release-metadata.test.ts`, `tests/aether/quality-release-extended.test.ts` |
| Tag identity                                      | The annotated `vX.Y.Z` tag                       | `quality-release-metadata.test.ts` with `AETHER_RELEASE_TAG`; CI runs it when the tag is pushed  |
| Feature claims and evidence                       | [Verification ledger](../verification/report.md) | `pnpm verification:check`                                                                        |
| Licences, notices and attribution                 | `THIRD_PARTY_NOTICES.md` and `REUSE.toml`        | `pnpm run oss:check`                                                                             |
| Commit and pull request titles                    | [CONTRIBUTING.md](../../.github/CONTRIBUTING.md) | The `commit-messages` job                                                                        |
| Known advisories                                  | `pnpm-lock.yaml`                                 | `pnpm audit:gate`                                                                                |
