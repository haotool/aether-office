# Legal and licensing

[Documentation](../README.md) · [Project](../../README.md)

These documents record how AETHER OFFICE meets the licence terms of everything it uses, derives from or ships. They describe
the project's own engineering practice. **They are not legal advice.** Items marked _maintainer decision_ or _needs legal
review_ have not been decided by a lawyer.

| Document                                         | What it holds                                                                                        |
| ------------------------------------------------ | ---------------------------------------------------------------------------------------------------- |
| [inventory.md](inventory.md)                     | The audited inventory: dependencies (shipped and development), derived code, generated code, assets. |
| [licence-policy.md](licence-policy.md)           | Allowed, conditional and denied licences; how to add a dependency, port code, add assets.            |
| [provenance.md](provenance.md)                   | Where the code and assets come from; the projects studied and what was (not) taken from them.        |
| [trademarks.md](trademarks.md)                   | How the names and marks of Anthropic, OpenAI, GitHub and others are used.                            |
| [THIRD_PARTY_NOTICES.md](THIRD_PARTY_NOTICES.md) | Generated notices: every shipped package, its licence text and its NOTICE file.                      |
| [../../NOTICE](../../NOTICE)                     | Short attribution notice (upstream project and Apache-2.0 material).                                 |
| [../../REUSE.toml](../../REUSE.toml)             | The licence and copyright of every file, by path ([REUSE](https://reuse.software) format).           |

## Commands

| Command                                                  | What it does                                                                                                                              |
| -------------------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------- |
| `pnpm run notices`                                       | Regenerates `THIRD_PARTY_NOTICES.md` and the package table of `inventory.md` from the lockfile and `node_modules`.                        |
| `pnpm run notices:check`                                 | Fails when they are stale, when a package's licence is unknown, denied or unapproved, or a file is not in REUSE.toml. Runs in CI.         |
| `node scripts/oss/third-party-notices.mjs --sbom <file>` | Writes a CycloneDX 1.5 SBOM of the shipped packages (attach it to a release; it is not committed).                                        |
| `node scripts/oss/overlap-scan.mjs --refs <clones>`      | Looks for code copied from reference projects (long verbatim overlaps); see [provenance](provenance.md#evidence-that-no-code-was-copied). |
| `pnpm run oss:check`                                     | The notices and REUSE checks, then the publishing-readiness check.                                                                        |
