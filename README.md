<img src="docs/images/readme-hero.en.webp" alt="AETHER OFFICE — orbital A logo, 3D office and live conversation feed, Git flower, and mobile office; actual UI with synthetic demo data" width="100%" />

<h1 align="center">One office for your coding agents.</h1>

<p align="center">
  <a href="https://github.com/haotool/aether-office/actions/workflows/ci.yml"><img src="https://github.com/haotool/aether-office/actions/workflows/ci.yml/badge.svg" alt="CI status" /></a>
  <a href="https://github.com/haotool/aether-office/releases"><img src="https://img.shields.io/github/v/release/haotool/aether-office?include_prereleases" alt="Latest pre-release" /></a>
  <a href="LICENSE"><img src="https://img.shields.io/badge/license-MIT-blue.svg" alt="MIT license" /></a>
</p>

<p align="center">
  <a href="#quick-start">Quick start</a> ·
  <a href="docs/README.md">Documentation</a> ·
  <a href=".github/CONTRIBUTING.md">Contributing</a> ·
  <a href="README.zh-TW.md">繁體中文</a>
</p>

_Actual application UI with synthetic demo data. The Git flower visualizes repository history.
[Image source and reproduction](docs/images/README.md#hero-provenance)._

AETHER OFFICE brings your **Claude Code and Codex sessions into one local 3D office**. See who is working, read
conversations and tool calls, and follow subagent squads without switching between terminals. The central Git flower
grows from repository history; token and Git KPIs show the activity behind the scene.

Open the same office on your phone over trusted Wi-Fi to follow the work away from your desk.

It runs locally: no AETHER account or cloud service is required. Your existing CLI credentials and provider subscriptions
remain with Claude Code or Codex.

> [!IMPORTANT]
> **Pre-release (`0.4.x`).** Some capabilities remain partly verified. Read the
> [verification ledger](docs/verification/report.md) and [support limits](#support-and-limits) before relying on it for a
> critical workflow.

## What you can do

| Workflow               | Capabilities                                                                                 | Guide                                                                                                       |
| ---------------------- | -------------------------------------------------------------------------------------------- | ----------------------------------------------------------------------------------------------------------- |
| Follow sessions        | Work state, conversation history, Markdown, folded tool calls and subagent squads            | [Features](docs/features.md)                                                                                |
| Respond to Claude Code | Opt-in permission prompts and an owned session's composer; external sessions start read-only | [Remote approvals](docs/getting-started.md#answer-claude-code-permission-prompts-from-the-browser-optional) |
| Understand activity    | Token and Git KPIs, session roles and activity signals across office floors                  | [Session roles](docs/roles.md)                                                                              |
| Use a phone            | Pair with a one-time QR code; open the feed and conversation in a bottom sheet               | [Phone access](docs/getting-started.md#open-it-from-a-phone-or-tablet)                                      |
| Manage execution       | Optional worktrees, terminals, bounded tasks, review and commit-bound verification           | [Native execution](docs/native-execution.md)                                                                |

## Quick start

**Requirements:** Node.js **24.21.0** (`>=24.21.0 <25`), pnpm **12.8.1**, and macOS or Linux. Versions are pinned in
`.nvmrc` and `package.json`. See [environment setup](docs/getting-started.md#requirements) if pnpm is not installed.

```sh
git clone https://github.com/haotool/aether-office.git
cd aether-office
pnpm install --frozen-lockfile
pnpm build
pnpm start
```

Open **<http://127.0.0.1:4310>** and sign in with the owner token. The terminal prints its **file location**; keep the
token private. `localhost:4310` is sent on to this address; any other host name is refused.

The first start creates `.data/live` with the database and local credentials. Recent Claude Code and Codex sessions
appear automatically as observed sessions. [First-run guide](docs/getting-started.md).

### Try the demo

After installing dependencies, run:

```sh
pnpm demo
```

Open **<http://127.0.0.1:4311>**. The demo uses fixture data and calls no paid model.

### Connect a phone

On a trusted local network:

```sh
AETHER_HOST=0.0.0.0 pnpm start
pnpm run pair
```

Scan the QR code on the same Wi-Fi. Pairing codes work once and expire after five minutes.

> [!WARNING]
> LAN access uses plain HTTP unless you configure HTTPS. Tokens and cookies cross that network unencrypted. Remote
> approvals require HTTPS or an explicit LAN opt-in; an installable app with its offline shell also needs a secure
> context. Follow the [phone and HTTPS guide](docs/getting-started.md#install-it-on-a-phone).

### Add exact activity and approvals

Hooks provide tool outcomes, subagent activity and permission prompts beyond the information available in transcripts.

```sh
pnpm hooks install --project /path/to/repo
pnpm hooks install --project /path/to/repo --remote-approvals
```

Review [what the installer changes](docs/getting-started.md#exact-activity-with-hooks-optional). Remote approvals apply to
Claude Code; Codex has no equivalent hook contract.

## Product tour

The live conversation feed shows work states, latest replies and subagents; Session management shows provider, branch and process details. Git commit history and event replay are separate views. Every item below links to actual desktop and phone screenshots.

| Feature                  | Desktop                                              | Phone                                              |
| ------------------------ | ---------------------------------------------------- | -------------------------------------------------- |
| 3D office and squads     | [View](docs/images/squad-strings-desktop.jpg)        | [View](docs/images/office-phone.jpg)               |
| Live conversation feed   | [View](docs/images/conversation-feed-desktop.en.jpg) | [View](docs/images/conversation-feed-phone.en.jpg) |
| Conversation and tools   | [View](docs/images/session-conversation-desktop.jpg) | [View](docs/images/conversation-phone.jpg)         |
| Session management       | [View](docs/images/sessions-desktop.en.jpg)          | [View](docs/images/sessions-list-phone.en.jpg)     |
| Token and Git KPIs       | [View](docs/images/kpi-dashboard-desktop.jpg)        | [View](docs/images/kpi-phone.en.jpg)               |
| Git commit history       | [View](docs/images/git-history-desktop.en.jpg)       | [View](docs/images/git-history-phone.en.jpg)       |
| Permission review        | [View](docs/images/approvals-desktop.en.jpg)         | [View](docs/images/approvals-phone.en.jpg)         |
| Interactive terminal     | [View](docs/images/terminals-desktop.en.jpg)         | [View](docs/images/terminals-phone.en.jpg)         |
| Event history and replay | [View](docs/images/event-history-desktop.en.jpg)     | [View](docs/images/event-history-phone.en.jpg)     |

Git history lives in the optional Advanced workspace. Permission screens show an undecided synthetic request. Terminal screens use the existing isolated PTY fixture: the on-screen “live” badge describes the local connection mode, not a real model call.

<details>
<summary><strong>Desktop: conversation feed, Git history and core features</strong></summary>

### Live conversation feed

The live conversation feed groups sessions by Needs you, Working and Recently finished, with reply previews and squad status.

<img src="docs/images/conversation-feed-desktop.en.jpg" alt="Live conversation feed — actual desktop interface, synthetic data" width="100%" />

### Git commit history

A synthetic Git repository supplies real commit lanes, branch refs, merges and SHAs, with worktree and Git-health information below.

<img src="docs/images/git-history-desktop.en.jpg" alt="Git commit history — actual desktop interface, synthetic data" width="100%" />

### Conversation and tools

<img src="docs/images/session-conversation-desktop.jpg" alt="Conversation and tools — actual desktop interface, synthetic data" width="100%" />

### 3D office and squads

<img src="docs/images/squad-strings-desktop.jpg" alt="3D office and squads — actual desktop interface, synthetic data" width="100%" />

### Session management

<img src="docs/images/sessions-desktop.en.jpg" alt="Session management — actual desktop interface, synthetic data" width="100%" />

### Token and Git KPIs

<img src="docs/images/kpi-dashboard-desktop.jpg" alt="Token and Git KPIs — actual desktop interface, synthetic data" width="100%" />

### Permission review

<img src="docs/images/approvals-desktop.en.jpg" alt="Permission review — actual desktop interface, synthetic data" width="100%" />

### Interactive terminal

The synthetic PTY fixture is running with ownership controls and output. It invokes no paid model and does not attach to an existing user terminal.

<img src="docs/images/terminals-desktop.en.jpg" alt="Interactive terminal — actual desktop interface, synthetic data" width="100%" />

### Event history and replay

<img src="docs/images/event-history-desktop.en.jpg" alt="Event history and replay — actual desktop interface, synthetic data" width="100%" />

### Wide office and Git-flower views

The original dark/light wide shots and flower-crown close-up retain earlier English application chrome and are labeled separately from the current views above.

**Dark wide view**

<img src="docs/images/office-overview-desktop.jpg" alt="Dark wide view — earlier English interface, synthetic data" width="100%" />

**Light wide view**

<img src="docs/images/office-overview-desktop-light.jpg" alt="Light wide view — earlier English interface, synthetic data" width="100%" />

**Git flower crown**

<img src="docs/images/office-crown-desktop.jpg" alt="Git flower crown — earlier English interface, synthetic data" width="100%" />

</details>

<details>
<summary><strong>Phone: 10 actual feature views</strong></summary>

**01 · Conversation feed: attention and work — 02 · Conversation feed: more work and finished sessions**

<p align="center">
  <img src="docs/images/conversation-feed-phone.en.jpg" alt="Conversation feed: attention and work — actual phone interface, synthetic data" width="280" />
  <img src="docs/images/conversation-feed-more-phone.en.jpg" alt="Conversation feed: more work and finished sessions — actual phone interface, synthetic data" width="280" />
</p>

**03 · Conversation and tools — 04 · Git commit history**

<p align="center">
  <img src="docs/images/conversation-phone.jpg" alt="Conversation and tools — actual phone interface, synthetic data" width="280" />
  <img src="docs/images/git-history-phone.en.jpg" alt="Git commit history — actual phone interface, synthetic data" width="280" />
</p>

**05 · 3D office and squads — 06 · Token and Git KPIs**

<p align="center">
  <img src="docs/images/office-phone.jpg" alt="3D office and squads — actual phone interface, synthetic data" width="280" />
  <img src="docs/images/kpi-phone.en.jpg" alt="Token and Git KPIs — actual phone interface, synthetic data" width="280" />
</p>

**07 · Permission review — 08 · Interactive terminal**

<p align="center">
  <img src="docs/images/approvals-phone.en.jpg" alt="Permission review — actual phone interface, synthetic data" width="280" />
  <img src="docs/images/terminals-phone.en.jpg" alt="Interactive terminal — actual phone interface, synthetic data" width="280" />
</p>

**09 · Session management — 10 · Event history and replay**

<p align="center">
  <img src="docs/images/sessions-list-phone.en.jpg" alt="Session management — actual phone interface, synthetic data" width="280" />
  <img src="docs/images/event-history-phone.en.jpg" alt="Event history and replay — actual phone interface, synthetic data" width="280" />
</p>

The feed drawer keeps its actual half-screen height; the first two views show its top and scrolled conversation rows, rather than substituting management metadata.

</details>

Workspace examples are synthetic and conversations retain their source language. These screenshots do not establish live-provider or release verification. [Complete image index and provenance](docs/images/README.md).

## Support and limits

| Area              | Current support                                                                                                           |
| ----------------- | ------------------------------------------------------------------------------------------------------------------------- |
| Claude Code       | No release allowlist; SDK initialization and required fields determine compatibility                                      |
| Codex CLI         | No release allowlist; stable app-server handshake and required fields determine compatibility                             |
| macOS             | Tested browser platform; native Windows terminals are unsupported                                                         |
| Linux             | Installation and unit tests run in CI; browser coverage is stated in the [development guide](docs/development.md#testing) |
| External sessions | Read-only until an eligible session is continued under AETHER's control                                                   |
| Permissions       | One trusted local operator; no multi-user isolation or sandbox for code running as that operator                          |
| Usage             | Token counts and recorded limit readings; no provider price table or monetary cost estimate                               |

ACP agents and the A2A gateway are optional. The complete contracts and upgrade procedure are in
[provider compatibility](docs/provider-compatibility.md).

## Architecture

The control plane owns the SQLite database and enforces authentication and commands. A read-only scanner discovers
sessions; server-sent events notify the web app of changes. The optional runner claims work and reports results through
the API, and the browser loads the Three.js scene when it is needed.

| Directory                                                   | Responsibility                                                         |
| ----------------------------------------------------------- | ---------------------------------------------------------------------- |
| `apps/control`                                              | Fastify API, authentication, database, session discovery and events    |
| `apps/runner`                                               | Provider processes, worktrees and terminals; no direct database writes |
| `apps/web`                                                  | React interface, session panel and app shell                           |
| `packages/contracts`, `kernel`, `providers`, `office-scene` | Shared contracts, domain rules, CLI adapters and scene assets          |

Read the [architecture](docs/architecture.md) and [security model](docs/security.md) for data flow and trust boundaries.

## Documentation

| Start here                                                       | Reference                                                | Project                                      |
| ---------------------------------------------------------------- | -------------------------------------------------------- | -------------------------------------------- |
| [Getting started](docs/getting-started.md)                       | [Configuration](docs/configuration.md)                   | [Contributing](.github/CONTRIBUTING.md)      |
| [How-to guides](docs/how-to.md)                                  | [Provider compatibility](docs/provider-compatibility.md) | [Development](docs/development.md)           |
| [Features](docs/features.md)                                     | [Security](docs/security.md)                             | [Changelog](CHANGELOG.md)                    |
| [Phone and HTTPS](docs/getting-started.md#install-it-on-a-phone) | [Verification ledger](docs/verification/report.md)       | [Architecture decisions](docs/adr/README.md) |

The [documentation index](docs/README.md) also covers design records, performance measurement, release procedures and
licensing. [繁體中文介紹](README.zh-TW.md).

## Contributing

Bug reports and focused pull requests are welcome. Start with [CONTRIBUTING.md](.github/CONTRIBUTING.md), the
[Code of Conduct](.github/CODE_OF_CONDUCT.md) and the [development guide](docs/development.md). AI-assisted contributions
follow the same review, verification and licensing rules; [AGENTS.md](AGENTS.md) records the repository boundaries.

Report vulnerabilities privately through [SECURITY.md](.github/SECURITY.md). Use [Support](.github/SUPPORT.md) for setup
questions and reproducible bug reports.

## License and attribution

[MIT](LICENSE). Copyright (c) 2026 haotool. Portions originate from
[AgentSystemLabs/agent-office](https://github.com/AgentSystemLabs/agent-office), copyright (c) 2026 AgentSystemLabs.
Attribution is retained in [NOTICE](NOTICE), [provenance](docs/legal/provenance.md) and the
[third-party notices](docs/legal/THIRD_PARTY_NOTICES.md).

AETHER OFFICE is an independent project and is not affiliated with, endorsed by or sponsored by Anthropic or OpenAI.
Claude and Claude Code are trademarks of Anthropic, PBC; Codex and OpenAI are trademarks of OpenAI. Other marks belong to
their owners.
