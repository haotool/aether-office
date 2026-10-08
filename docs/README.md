# Documentation

The [project README](../README.md) is the short version: what it is, a quick start and the limits. These pages are the manual.
They are written in English; the Traditional Chinese README is [README.zh-TW.md](../README.zh-TW.md).

## Use it

| Document                              | Contents                                                                                         |
| ------------------------------------- | ------------------------------------------------------------------------------------------------ |
| [Getting started](getting-started.md) | First run in five minutes, hooks, phone and QR pairing, HTTPS and the installable app, upgrading |
| [Features](features.md)               | How the features behave: the panel, approvals, KPIs, the office, office life, the tour           |
| [Configuration](configuration.md)     | Every environment variable and the native-execution file                                         |
| [Session roles](roles.md)             | How a session is placed on a floor: signals, evidence, accuracy                                  |

## Understand it

| Document                                            | Contents                                                                         |
| --------------------------------------------------- | -------------------------------------------------------------------------------- |
| [Architecture](architecture.md)                     | Components, data flow, the HTTP surface, module boundaries                       |
| [Security](security.md)                             | Threat model, trust boundaries per endpoint, safety properties, remote approvals |
| [Provider compatibility](provider-compatibility.md) | Verified CLI releases, hook contracts, models, signals, ACP and A2A              |
| [Native execution](native-execution.md)             | The optional runner: worktrees, approvals, terminals, observation, processes     |

## Contribute

| Document                          | Contents                                                              |
| --------------------------------- | --------------------------------------------------------------------- |
| [Development](development.md)     | Layout, commands, test layers, the animals pipeline, contact sheets   |
| [Design system](design-system.md) | Tokens, components, the panel, the 3D office, responsive rules        |
| [Dependencies](dependencies.md)   | Notable dependency choices and supply-chain controls                  |
| [Screenshots](images/README.md)   | The images in the README, what they show and how to regenerate them   |

## Design records

Written before or while the work was built, kept for the reasoning. They are history, not the current manual: where they
differ from the pages above, the pages above win.

| Document                                                | Contents                                                                           |
| ------------------------------------------------------- | ---------------------------------------------------------------------------------- |
| [Office life: spec](design/office-life.md)              | Squads, signals, office-life effects and the first-visit tour: rules and budgets   |
| [Office life: work plan](design/office-life-work-plan.md) | The briefs the iterations were run from                                         |
| [Architecture decisions](adr/README.md)               | Why the project is built the way it is (indexed list)                              |
| [Research](research/README.md)                          | The projects studied and what was taken from them                                  |
| [Orca view feasibility](research/orca-view-feasibility.md) | A read-only office view over Orca: sources, risks, phases (zh-TW)                  |
| [Mobile gradient and frame performance](research/mobile-gradient-perf.md) | Banding, dithering, tiers and phone budgets: sources, audit, measurements, ranked changes (zh-TW) |

## Release and verification

| Document                                                | Contents                                                                       |
| ------------------------------------------------------- | ------------------------------------------------------------------------------ |
| [Quality scorecard](quality/scorecard.md)               | Computed score per area, the rubric ([how](quality/README.md)) and what costs points |
| [Mobile perf harness](quality/mobile-perf.md)         | M-MID/M-LOW A/B measurement, evidence schema, G5 field steps                        |
| [Verification ledger](verification/report.md)           | What is implemented and what is verified, per capability                       |
| [Publishing checklist](release/publishing-checklist.md) | From the readiness check to a public repository, branch protection, a release  |
| [Cleaning the history](release/history-cleanup.md)      | The three options (A, B, C), the `scripts/oss` kit, commands, measured results |
| [Legal and licensing](legal/README.md)                  | Licence inventory, licence policy, provenance, trademarks, notices and SBOM    |
| [Changelog](../CHANGELOG.md)                            | User-facing changes per release                                                |
