# Version policy

[Documentation](../README.md) · [Project](../../README.md)

AETHER OFFICE is one source-distributed application. The root `package.json` is its version source; the private workspace
manifests carry the same value so tools report one product version. Releases use `vX.Y.Z` annotated tags and follow
[Semantic Versioning](https://semver.org/) with the pre-1.0 rules below.

## Compatibility surface

The user-facing contract includes CLI commands, environment variables, configuration files, HTTP and agent-protocol
messages, hook files, persisted database migrations, layouts and browser preferences. The `@aether/*` workspace packages
are private implementation details. A surface explicitly labelled experimental may change under the pre-1.0 policy, but
the changelog still describes the change and its upgrade steps.

## Before 1.0

- Patch (`0.4.1`): compatible fixes, security hardening, documentation and internal performance work.
- Minor (`0.5.0`): new user-facing capability or a documented compatibility change that needs an upgrade step.
- Major (`1.0.0`): the compatibility surface becomes stable and the stable-release evidence gates are satisfied.

Commit types are inputs, not the version decision: `fix` normally means patch and `feat` normally means minor, while a
maintainer reviews configuration, persistence and protocol effects before choosing the version.

## Release identity

Work accumulates under `Unreleased`. A release commit moves those entries into a dated version section. The annotated tag,
root and workspace versions, changelog heading and compare links must agree, and the tag must point at the clean, verified
`main` commit. Published tags and release assets are not replaced; a correction receives a new version.
