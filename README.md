# AETHER OFFICE

A local-first workspace for collaborative coding agents, with a 3D orbital office and a usable 2D workbench. Based on the MIT-licensed AgentSystemLabs/agent-office source; see [third-party notices](THIRD_PARTY_NOTICES.md).

**Development version. Not a production-ready release.** The current working slice has a durable SQLite control plane, role checks, persistent messages, tasks, a separately running deterministic fixture provider, React pages and a procedural 3D office. Codex/Claude adapters, run-scoped MCP, isolated Git workspaces, approvals and eight rigged Blender animal families are implemented in the development slice. Live provider smoke, full review/verification, campus art and the remaining profiles are still being implemented against [the full specification](docs/MASTER_SPEC.md).

## Run locally

Use Node **24.21.0** and the exact pnpm version in `package.json` (currently **12.8.1**).

```sh
pnpm install --frozen-lockfile
pnpm build
pnpm demo
```

The demo UI is served at `http://127.0.0.1:4311`; control and the independent runner use port 4310. The terminal prints the location of `.data/demo/owner-token`. Read that local file and paste its value into the login form. Do not share the token. The demo uses no paid models and never treats fixture output as live-provider evidence.

To run the built artifacts:

```sh
pnpm setup --demo
AETHER_MODE=demo pnpm start
# In a separate terminal:
AETHER_MODE=demo node apps/runner/dist/main.js
```

The built UI is served by control at `http://127.0.0.1:4310`.

`pnpm setup` and `pnpm dev` select a separate live data directory. Native execution requires explicit project policy plus local runner configuration; see [native execution and MCP](docs/NATIVE_EXECUTION.md). No paid provider smoke has been run.

## Local sessions (observe-only)

Signed-in owners and operators see recent Claude Code and Codex sessions from this machine as observed characters in the office. Discovery reads only session ids, working directories and file times, plus read-only `git status`; transcripts are not read or stored. Sessions in linked worktrees group under the repository's Git common directory. Set `AETHER_LOCAL_SESSIONS=off` to disable.

For authoritative activity and subagent attribution, opt in to hooks per project:

```sh
pnpm hooks install --project /path/to/repo   # writes .claude/settings.local.json
pnpm hooks remove --project /path/to/repo
```

`--scope user` edits `~/.claude/settings.json` and affects every session on the machine. The receiver records only ids, event names and the working directory in `~/.aether/hook-events.jsonl`.

## Current checks

```sh
pnpm typecheck
pnpm lint
pnpm format:check
pnpm test
pnpm build
pnpm exec playwright test
```

Browser tests start real control and runner processes, use an isolated SQLite data directory and exercise HTTP without request mocks. Chrome is selected in `playwright.config.ts`. They do not start paid agents. Test reports distinguish fixture, browser, native, GPU and Blender scope; [progress](docs/PROGRESS.md) records actual results and remaining work.

Upstream tests are retained under `tests/*.test.ts` and were run against an unmodified clone; they do not establish acceptance of the new control plane. The old upstream server under `src/server` is a reference retained during the fork transition; new root commands do not launch it.

## Safety model

- Loopback binding with Host/Origin, authentication, HttpOnly cookies and CSRF checks.
- A command's actor comes from authentication; payloads cannot choose their sender or role.
- SQLite state, event, outbox and command receipt commit together. Message acknowledgement is separate from persistence.
- A lost runner moves uncertain work to `indeterminate`; it is not automatically re-executed.
- No permission bypass, automatic paid model run, remote push or publication is authorized by installing this repo.
- Worktrees are not sandboxes. Strong hostile-tenant isolation is outside the intended local trusted-operator deployment model.

## Product scope and evidence

`docs/FEATURES.json` preserves the 144 original acceptance statements. Implementation and verification are independent fields. `docs/exec-plans/active.md` tracks the complete work; incomplete items are not dropped to make the build look finished.
