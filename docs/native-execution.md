# Native execution

[Documentation](README.md) · [Project](../README.md)

<details>
<summary>Contents</summary>

- [Setup](#setup)
- [Execution model](#execution-model)
- [Review, verification and acceptance](#review-verification-and-acceptance)
- [Interactive terminals (PTY)](#interactive-terminals-pty)
- [External read-only observation](#external-read-only-observation)
- [Live smoke test](#live-smoke-test)
- [Process lifecycle: stop, survivors, orphans and zombies](#process-lifecycle-stop-survivors-orphans-and-zombies)
- [Claude subscription limits](#claude-subscription-limits)

</details>

Native execution lets AETHER OFFICE start Codex or Claude Code itself, in isolated Git worktrees, under explicit approvals.
It is **off by default** and needs two independent grants: a local configuration file on the runner's machine and an
explicit per-project opt-in by the project owner. Saving settings never starts a model; only an assignment does.

Status: development. Synthetic-provider integration tests (real HTTP, SQLite and Git, with a scripted Codex app-server) and
a real live smoke test have run; synthetic tests do not prove that a provider login, network, quota or external service
works. See the [verification ledger](verification/report.md).

## Setup

```sh
pnpm install --frozen-lockfile && pnpm build
pnpm run setup                        # creates live control data and an owner token (path is printed, never the value)
AETHER_MODE=live pnpm start
```

Sign in, create a project with the absolute path of a repository, then run `pnpm run setup` again to create a runner token
scoped to the projects that exist now (a new project never widens an existing runner; register further scopes through
`/api/machines`). Write the local [native-execution file](configuration.md#native-execution-file) (kept outside version
control) and start the runner:

```sh
AETHER_MODE=live AETHER_NATIVE_CONFIG=/absolute/path/to/native.json pnpm runner
```

Finally the project owner enables execution in **Settings → Native agent execution** and sets turn and time limits.
Closing the setting cancels work that has not started and requests cancellation of work that has.

Provider versions are not allowlisted. The installed CLI may initialize through the official protocol or SDK; malformed
required responses still fail safely ([provider compatibility](provider-compatibility.md)).

## Execution model

- **Your credentials stay yours.** AETHER neither stores nor forwards your Claude credentials: it runs your own Claude Code in
  your environment.
- **One worktree per writer.** Each agent works in its own Git worktree. Uncommitted changes in the source checkout are
  neither copied into it nor deleted. A worktree isolates work; it is not an OS sandbox.
- **Provider settings.** Codex runs with `workspace-write`, `networkAccess=false` and user approvals. Claude uses the SDK's
  default permission mode with human tool approval. No bypass mode exists. Running programs remain inside the trust boundary
  of the local runner.
- **MCP tools.** The runner configures an MCP stdio server per run. Its credential is scoped to one run, agent and project
  and expires when the work ends, is cancelled, times out or the machine is revoked. Tools: `whoami`, `list_work`,
  `get_inbox`, `get_message`, `send_message`, `ack_message`, `wait_for_message`, `propose_knowledge`. Reading a message is
  not acknowledging it; a retried send must reuse its idempotency key and arguments; peer messages are untrusted and cannot
  authorize tools or spending.
- **Tool approvals** move through `pending → decided → decision_sent → provider_acknowledged`. The last state requires the
  provider's own tool event. An approval binds to one request, session and parameter hash; session-wide auto-approval is
  not supported.
- **Usage** is accumulated as a high-water mark per machine, agent, provider session and turn, then attributed to the run, so a
  replayed turn is not counted twice. It depends on the adapter identifying turns correctly and is not a billing statement.

Not yet complete: certification of external-session formats, cross-platform PTY verification and manual closing of
indeterminate sessions, a general ACP workflow, a full cross-provider review/fix/verification workflow, and long-running
live validation of real code changes.

## Review, verification and acceptance

An owner or operator can ask a different Codex or Claude agent to review a finished task (this may use signed-in provider
quota). `work.request_review` binds to the work version, the engineering head and base SHAs, the chosen reviewer and the
source machine. The review run has its own purpose, session, branch and checkout, does not count as an engineering attempt
and cannot overwrite the engineering result. An agent cannot review its own work, and a late review for a different SHA or
version is kept as history but never applied.

Reviewers are read-only (Codex: read-only sandbox, no network; Claude: only Read, Glob and Grep) and refuse privilege
escalation; their MCP session can write only messages and knowledge proposals. The runner checks the pinned head and a clean
state before and after, supplies the `base..head` patch (refused above 60 KB), parses a strict JSON decision, and returns it
through the durable report path. `approve` only unlocks a pinned verifier; it cannot complete the task.

### Pinned verifiers

The native file may declare trusted verifiers:

```json
"verifiers": {
  "project-tests": { "file": "/absolute/path/to/trusted-verifier.mjs", "timeoutMs": 30000 }
}
```

At startup the runner copies each into an immutable file and publishes its SHA-256. A verifier is a Node program run with the
tested worktree as its working directory; it is operator-trusted code, never a file an agent generated. A dirty tree before
the run, or any change to the SHA, index, tree, base or verifier during it, yields no "verified" status. It inherits only
`PATH`, `HOME`, `USER`, temp-directory and locale variables, never runner tokens or API keys; this is not filesystem
isolation. On POSIX a timeout kills the process group the run created.

After an approved review the owner picks a published verifier. The job is journaled before it runs and is not re-run
blindly after a restart. "Accept this version" requires evidence matching the head and version at that moment. Accepting is
a confirmation in the control plane; it does not merge or push anything.

### Changes requested and retries

An owner or operator can retry a failed or changes-requested task, by default up to three runs in total. A retry creates a
new run, session, MCP identity and approvals, keeps the original agent, machine and worktree (committed and uncommitted files),
and attaches the latest review comments; earlier reviews and verifications do not carry over. A retry is refused when the
previous result is uncertain, a worktree job is still active, the machine was revoked or the worktree is missing. If the
original machine is offline the retry waits for it; it is never redone from a clean HEAD elsewhere.

By default a retry starts a new provider session. "Continue the original conversation" resumes the previous Codex or Claude
session while still creating a new platform run, identity and approval scope; the session id is looked up by the server, never
taken from the client. After the limit the owner can approve one extra run with a reason (the approval does not start a model
and does not accumulate); a single task is capped at 100 runs.

### Diagnostics

Task details show read-only diagnostics that separate machine heartbeat from recent work events. No heartbeat for 45 s means
the machine is offline; heartbeats without a work event for 60 s means "no new events", not "deadlocked". Diagnostics
distinguish peer waits, tool approvals (waiting, decided, expired), queued, cancelling, revoked machine and indeterminate. They
never restart, stop or change a run, and no provider rate-limit signal is inferred from silence.

## Interactive terminals (PTY)

The native file can offer fixed local terminal profiles. A profile's root must be an authorized repository and match the
project's root; the UI cannot supply an arbitrary executable, arguments or directory.

```json
"terminals": {
  "project-shell": { "binary": "/bin/zsh", "args": ["-f"], "root": "/absolute/path/to/your/repository", "timeoutMs": 600000 }
}
```

`"cliTerminals": true` adds `claude-<folder>` and `codex-<folder>` profiles per authorized repository that run the configured
CLI with no extra flags, so its own prompts and slash commands work in the browser. Such sessions are also found by local
session discovery. Starting a terminal runs a real local program and creates no task result or approval evidence.

- **What AETHER can drive, and what it cannot.** AETHER types only into a terminal it started (a runner PTY). The session
  panel's composer therefore appears only for a session whose process is that terminal's child (or under it): the control
  plane matches the scanner's process for the session to a running terminal by pid and start time, walking up the process
  tree (`services/terminal-link.ts`). A session started in any other terminal, in an editor, or in Codex Desktop is
  observed only: there is no route that writes to it and none is pretended. For such a session the panel offers **Continue**
  and **Fork in AETHER**: `terminal.start` with `resume: { provider, sessionId, fork }`, which the runner turns into
  `claude --resume <id> [--fork-session]` or `codex resume <id>` / `codex fork <id>`, in the profile's directory. Only the
  `cliTerminals` profiles qualify (the profile must be exactly the provider's own binary with no arguments of its own); a
  hand-written profile keeps what its owner wrote, and the id is a single positional argument that cannot read as a flag. The
  button needs a profile whose folder is the session's own folder; a session in a linked worktree has none until that
  worktree is granted. Managed runs (Agent SDK, `codex app-server`) are not terminals and have no composer; they take
  messages through Messages.
- What a composer send does: Ctrl+U, the text (bracketed paste when multi-line), Enter after 150 ms, each as an ordinary
  `terminal.input` under the lease, so everything below applies. Esc and Ctrl+C for Stop are the same route. "Applied" still
  means only that the runner wrote it to the PTY; the transcript is what shows the CLI took it.
- A terminal is read-only by default. An owner or operator can take control (30 s lease renewed by input; an epoch fences stale
  controllers). Reloading the page returns to read-only while the process keeps running; closing it does not stop it.
- Input is queued; "applied" means only that the runner wrote it to the PTY. The local journal records acceptance before the side
  effect; an unknown HTTP result is never re-sent, and after a restart the terminal is marked `indeterminate` with its snapshot
  kept. Stopping signals the process group (`TERM`, then `KILL`).
- The transport keeps the latest 8 KiB and at most 256 output chunks and flags a gap; it is not a full ANSI screen
  serialization. OSC 52 clipboard requests are suppressed and no link-opening add-on is loaded.
- The control plane reads what the agent in a terminal is doing (working, waiting for you, idle) from the bottom of its screen
  and shows it in the list; unfamiliar output reads as unknown, never a guess (`packages/kernel/src/terminal-state.ts`).
- Verified on macOS (real PTY, HTTP and SQLite, restart without re-sending, Unicode, ANSI, resize, group termination, browser
  journey) using a labeled Node fixture. Selected Linux synthetic browser journeys also run in CI; the full Linux fault
  matrix and WSL2 acceptance remain open. Native Windows refuses to start the supervisor.

## External read-only observation

For transcripts outside AETHER's own control, create a member with provider `observe`, take the full project and agent ids
from the authorized `GET /api/projects/:projectId/snapshot`, and add to the native file:

```json
"observations": {
  "external-codex": {
    "projectId": "00000000-0000-4000-8000-000000000001",
    "agentId": "00000000-0000-4000-8000-000000000002",
    "provider": "codex",
    "projectRoot": "/absolute/path/to/your/repository",
    "approvedRoot": "/absolute/path/to/approved/transcript/folder",
    "files": ["session.jsonl"]
  }
}
```

`projectRoot` must be an authorized repository and equal the project's canonical root, and each file's `cwd` must match.
`files` are relative to `approvedRoot`; escapes and symlinks are refused. With `discover: true` the runner searches the
approved root for JSONL (never the home directory by default; at most 64 sources, 1,000 entries, six directory levels).
Changes need a runner restart.

- Codex reads `session_meta` with a matching absolute `cwd` and a verified CLI version, and keeps visible user and assistant
  text and tool names (reasoning and non-visible channels are dropped), at most 256 KiB and 128 lines per poll. Claude
  decodes the approved file through the installed SDK's read-only `getSessionMessages` with a read-only session store and
  starts no model (2 MiB ceiling).
- The page is labeled OBSERVE / read-only and carries no approval or completion authority. Cursors and pending batches are
  stored in one fsynced journal; the control plane de-duplicates by report id, source revision and record id, so a lost ACK is
  safe to retry. "Last read" is when AETHER received data, not a provider heartbeat. Missing files, unknown formats, escapes
  and limits show explicit states, never idle or success.
- Compatibility is verified with synthetic files only; no private transcript has been read.

## Live smoke test

`pnpm run smoke:live -- --confirm-subscription-quota [--only claude|codex|exchange]` starts real Claude Code and Codex
sessions in a throwaway directory and Git repository using the CLIs' own logins. It reads and writes no API key, consumes a
little subscription quota (so it never runs without the flag), and approves only AETHER's collaboration tools
(`mcp__aether__*`, or `mcpToolCall` on the `aether` server); commands and file edits are denied.

On macOS (Codex CLI 0.160.0, Claude Code 2.1.288): each provider ran a real session and called `whoami` with a matching
agent id; in the exchange test Claude sent a request with a nonce, Codex received it with `wait_for_message` and replied with
two nonces, and Claude read the reply (the request's delivery state became `responded`). This shows the two providers can
talk through AETHER's durable messages; it does not show long-run stability, Windows or Linux, or a real code-change
workflow. Codex expresses MCP tool approval as an elicitation, which the platform treats as a single-call approval and never
as "remember for the session".

## Process lifecycle: stop, survivors, orphans and zombies

Two kinds of process are handled by different rules.

### Processes AETHER starts

- Every child is started `detached` as the leader of its own process group. Stopping sends `SIGTERM` to the group, waits a
  bounded time (1 s by default), then `SIGKILL`, so a process that ignores `SIGTERM` does not live forever. All four launch
  paths (PTY, workspace execution, JSON-RPC, ACP) share one stopper (`packages/providers/src/process-control.ts`).
- The timer is cancelled on the child's `close` (all pipes closed), not `exit`: a group can outlive its leader, and once it is
  gone the group id is a recycled pid that must not be signalled.
- **Pid reuse.** The journal records `pid:start-time` (`ps -o lstart=`). After a runner crash, `Runner.reapSurvivors()`
  judges each unfinished run and terminal (`judgeSurvivor`): absent → `gone`; different start time → `reused` (never
  touched); zombie → `zombie`; alive parent → `owned` (left to its parent); only the same process, still running and no longer
  owned, is `orphaned` and receives `SIGTERM` (group), a bounded wait and `SIGKILL`, with the identity re-checked before each
  signal. A previous rule of "never touch persisted pids" let agents started before a crash run on as orphans and keep spending
  quota.
- **An orphan is not `ppid <= 1`.** Under `systemd --user` an orphan is adopted by the user manager, a large live pid. The
  check is "parent absent, init, or a manager that adopts orphans".
- A process is never identified by name or command line to be killed; identity is `pid` plus start time.

### Sessions you start yourself (read-only observation)

- Liveness answers two questions separately: is there a process, and is anything happening in it. `session-liveness.ts`
  classifies a session as `active` (activity within two minutes), `idle`, `dormant` (process alive, quiet over six hours),
  `orphaned` (what started it is gone), `ended` or `unknown` (Codex Desktop threads share one app server). Activity is the
  latest of transcript writes, hook events and CPU time growth (remembered by pid and start time, so a long compile in a quiet
  session is not called dormant), capped by the process's own lifetime.
- **Every live session is found.** The process table is read first, then each process is matched to its session however old.
  The previous "latest 60 files" rule lost day-old sessions whose transcript was quiet (2 of 10 on real data). Now every
  session with a process is shown, plus the 60 most recent others; unmatched ones are resolved from the process itself (Claude:
  the `--resume` id or the newest file of its project folder; Codex: the id in its rollout filename). File-header parses are
  cached permanently.
- **Zombies** (state `Z`) have no name, arguments or working directory on macOS, so they cannot be matched to a session
  directly. They belong to the parent that never collected them, and are counted under that session's process tree. A zombie
  cannot be killed; the parent must finish or `wait`. The UI offers a one-tap "reap" that sends `SIGCHLD` to those living
  parents (identity pid plus start time, audited as `local-session.zombies.nudged`).
- **Stopping** (only `dormant` or `orphaned`, owner only): `POST /api/local-sessions/:key/stop`. The server recomputes the
  state itself, requires the client to echo the start time it saw, refuses itself and its ancestors, rereads the process table
  just before signalling, and sends a single `SIGTERM` to that process only (not the group, which may be someone's terminal
  job). If it ignores it, that is reported; no `SIGKILL`. The event `local-session.stop.requested` is audited.
- In 3D: dormant is a sleeping rabbit at the seat, orphaned is a ghost floating above it, and zombies under a session are a
  jiangshi standing behind the chair (the member stays seated).

## Claude subscription limits

Claude's 5-hour and 7-day usage is shown in the top bar. AETHER only reads a file the user already has: the claude-hud
plugin's cache (`~/.claude/plugins/claude-hud/.usage-cache.json`), or the path in `AETHER_CLAUDE_USAGE_FILE`. It is capped at
64 KB, only numbers, plan name and times are parsed, nothing is logged or written, no credential is touched and no request is
made. `GET /api/claude-limits` (human owner or operator only) serves it. Values at or above 85% turn amber; data older than 15
minutes, or a plugin in back-off, is dimmed and labeled; without the file the display is "—" with the reason. An expired window
is not shown. To use the officially documented source instead, have your own `statusLine` command write the `rate_limits` JSON
to a file and point `AETHER_CLAUDE_USAGE_FILE` at it. AETHER never edits `~/.claude/settings.json`.
