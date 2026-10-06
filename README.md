# AETHER OFFICE

[![CI](https://github.com/haotool/aether-office/actions/workflows/ci.yml/badge.svg)](https://github.com/haotool/aether-office/actions/workflows/ci.yml)
[![License: MIT](https://img.shields.io/badge/license-MIT-blue.svg)](LICENSE)

**A local-first workspace for coding agents.** AETHER OFFICE shows the Claude Code and Codex sessions running on your
machine as characters in a 3D office, groups them by project and role, and lets you assign, review and verify work
across agents from a browser, including from a phone on your local network.

English · [繁體中文](README.zh-TW.md)

> **Status: development (`0.4.0-dev`).** It is usable and heavily tested, but it is not a production release. The
> [verification ledger](docs/verification/report.md) states exactly which capabilities are verified and which are not.

<p align="center">
  <img src="docs/images/office-desktop.jpg" alt="The 3D office with the floor panel (demo data)" width="72%">
  <img src="docs/images/office-phone.jpg" alt="The same office on a phone" width="22%">
</p>

## Features

- **Sees your agents without setup.** Local Claude Code and Codex sessions are discovered read-only and appear as
  animal characters, placed on a floor and desk by the engineering role their work belongs to. Optional hooks add exact
  activity (working, waiting for approval) and subagent attribution.
- **A 3D office that explains itself.** A camera director cuts to who is talking, waiting, in error or working; messages
  and subagents are drawn between desks; a sleeping rabbit, a ghost and a jiangshi mark dormant, orphaned and zombie
  sessions, with one-tap actions to stop or reap them.
- **A full 2D workbench.** Local sessions, approvals, terminals, history and a Git graph and health view by default; turn on
  Advanced in Settings for tasks (list, board, dependency graph), messages and rooms, reviews, knowledge, schedules and more.
  It adapts to phones, tablets and desktops, and alerts you (project name only) when a session needs you.
- **Managed execution with safety rails.** A separate runner starts Codex or Claude in isolated Git worktrees, with
  per-call tool approvals, fixed-SHA review and verification, durable journals and no permission bypass.
- **Interoperable.** MCP tools for agents, an A2A gateway, an ACP client, hooks, and a typed HTTP API.
- **Honest by design.** Observed sessions are read-only, demo and fixture data are labeled, and no paid model runs
  unless you explicitly enable it.

## Quick start

Requires Node.js **24.21.0** and the pnpm version pinned in `package.json`.

```sh
pnpm install --frozen-lockfile
pnpm build
pnpm demo
```

Open `http://127.0.0.1:4311` and sign in with the owner token whose location the terminal prints. The demo uses fixture
data and calls no paid model. See [Getting started](docs/getting-started.md) for live mode, local-network access from a
phone, hooks and native execution.

## Documentation

| Document                                                 | Contents                                                          |
| -------------------------------------------------------- | ----------------------------------------------------------------- |
| [Getting started](docs/getting-started.md)               | Install, demo and live modes, phone access, hooks                 |
| [Architecture](docs/architecture.md)                     | Components, data flow, modules and their boundaries               |
| [Configuration](docs/configuration.md)                   | Environment variables and the local native-execution file         |
| [Native execution](docs/native-execution.md)             | Runner, worktrees, approvals, PTY, observation, process lifecycle |
| [Security](docs/security.md)                             | Threat model, trust boundaries, safety properties                 |
| [Design system](docs/design-system.md)                   | UI tokens, components, responsive and accessibility rules         |
| [Development](docs/development.md)                       | Repository layout, checks, testing, the animals pipeline          |
| [Provider compatibility](docs/provider-compatibility.md) | Verified Claude Code and Codex releases, ACP and A2A versions     |
| [Verification ledger](docs/verification/report.md)       | Per-capability implementation and verification status             |
| [Architecture decisions](docs/adr)                       | Why the project is built the way it is                            |

## Contributing

Contributions are welcome. Read [CONTRIBUTING.md](CONTRIBUTING.md) and the [Code of Conduct](CODE_OF_CONDUCT.md).
Security issues go through [SECURITY.md](SECURITY.md), not public issues.

## License

[MIT](LICENSE). Copyright (c) 2026 haotool; portions copyright (c) 2026 AgentSystemLabs, from which this project
started ([agent-office](https://github.com/AgentSystemLabs/agent-office)). Third-party software and its terms are listed
in [THIRD_PARTY_NOTICES.md](THIRD_PARTY_NOTICES.md).
