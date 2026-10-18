# Provider compatibility

[Documentation](README.md) · [Project](../README.md)

<details>
<summary>Contents</summary>

- [Verified releases](#verified-releases)
- [What is implemented and how it is verified](#what-is-implemented-and-how-it-is-verified)
- [Remote approvals (synchronous `PermissionRequest` hook)](#remote-approvals-synchronous-permissionrequest-hook)
- [External observation readers](#external-observation-readers)
- [Model catalog](#model-catalog)
- [Signals for the office: what each provider gives, what is derived, what is missing](#signals-for-the-office-what-each-provider-gives-what-is-derived-what-is-missing)
- [ACP and A2A](#acp-and-a2a)

</details>

AETHER OFFICE integrates with agent CLIs through their official interfaces only: the Codex app-server protocol, the Claude
Agent SDK, ACP, and the hook mechanisms of Claude Code and Codex. It does not parse private stdio formats.

## Verified releases

Provider admission does not use a release allowlist. Any syntactically valid Codex or Claude Code version, including
prereleases and future major versions, may load without changing this repository. Version output still identifies the
expected executable. Codex uses the stable app-server initialization handshake; Claude uses the pinned Agent SDK.
Required response fields, request scope and permission checks remain enforced. New optional fields and unknown notifications
are ignored; unknown server requests are refused. A breaking change to a required protocol can still need an adapter fix:
accepting a version is not a guarantee of an untested upstream protocol or a successful model turn.

`packages/providers/generated/compat.json` records the historical provenance and digest of the committed Codex TypeScript
reference types. Its release list is not a runtime gate. The generated files remain unchanged; `pnpm run protocol:regen`
is a maintainer tool for an intentional protocol update, not a prerequisite after a CLI upgrade. `pnpm run doctor` reports
installed versions and authentication without warning simply because a version is absent from that historical list.

Local no-inference checks initialize installed Codex and Claude processes in temporary directories. Synthetic future-version
CLIs exercise native start, review and observation paths. Paid turns, authentication, quota and arbitrary future breaking
protocols are separate verification concerns.

Reference documentation: [Codex App Server](https://learn.chatgpt.com/docs/app-server),
[Claude programmatic CLI](https://code.claude.com/docs/en/headless) and
[Agent SDK permissions](https://code.claude.com/docs/en/agent-sdk/permissions).

## What is implemented and how it is verified

| Capability                                    | Implementation                                                                                                          | Verification                                                                                                                                                                                                                              |
| --------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Demo fixture                                  | Real subprocess, journal and control-plane API                                                                          | Local process and HTTP browser end-to-end tests                                                                                                                                                                                           |
| Codex native                                  | App-server, worktrees, runner journal, approval and event bridge                                                        | Synthetic real-process tests; a live smoke test on the installed CLI                                                                                                                                                                      |
| Claude native                                 | SDK adapter wired to the runner; message normalizer tested                                                              | Unit tests; a live smoke test on the installed CLI                                                                                                                                                                                        |
| Subagent lifecycle                            | Hook records with `agent_id` (start, tool calls, permission, stop); Codex spawned rollouts (`session_meta`, last write) | Synthetic spool files and rollouts in the on-disk formats (`tests/aether/subagent-lifecycle.test.ts`)                                                                                                                                     |
| Command labels, call outcomes, subagent files | Receiver labels and `ok`; transcript pairing by tool id; `<session>/subagents/agent-*.jsonl`                            | Synthetic transcripts and spool files in the on-disk formats (`tests/aether/command-tags.test.ts`, `hook-receiver.test.ts`, `tool-outcomes.test.ts`, `subagent-transcripts.test.ts`); shapes confirmed read-only on real files, see below |
| PTY, observation, ACP                         | See [native execution](native-execution.md)                                                                             | Real PTY and real-file tests; ACP initialize against real adapters                                                                                                                                                                        |

A runner publishes only the demo capability by default. A live runner needs `AETHER_NATIVE_CONFIG` pointing at a local JSON file
with `enabled: true`, plus an explicit per-project opt-in by the owner; both are required before live work is dispatched.

Native start and resume bind to the project, worktree, agent session and provider thread; `sessionId`, `runId` and `threadId`
are never treated as one id. Approvals keep their request id and are decided once; session-wide auto-approval is refused. Tool
errors are distinct from normal completion. Input and output token usage is recorded when available; model reasoning is not
collected. No `--yolo`, `--dangerously-skip-permissions` or automatic switch to a paid API exists anywhere.

## Remote approvals (synchronous `PermissionRequest` hook)

Contract used, taken from Claude Code's hooks documentation and checked against the installed CLI (`claude` 2.1.289: its
hook-output schema is in the binary): the hook receives `{hook_event_name: "PermissionRequest", tool_name, tool_input,
permission_suggestions?, ...}` on stdin and may print, with exit code 0,
`{"hookSpecificOutput":{"hookEventName":"PermissionRequest","decision":{"behavior":"allow"|"deny", "message"?, "updatedInput"?,
"updatedPermissions"?, "interrupt"?}}}`. No output, a non-zero exit, a parse failure or a timeout leaves the permission flow
unchanged: Claude asks in the terminal. Exit code 2 is not a deny for this event; a deny must be the JSON. `async: true` is
ignored for this event, so the entry is synchronous and carries its own `timeout` (the wait plus 15 s). `updatedPermissions` is
an array of permission-update objects (`{type: "addRules", behavior: "allow", destination: "session", rules: [{toolName,
ruleContent?}]}`), not strings (one documentation summary said strings; the CLI's schema says objects). AETHER implements allow,
deny with a message, and allow-for-session using the rules from `permission_suggestions` with `destination` forced to
`session`; it does not use `updatedInput`.

The installer entry is tagged `aether-office-hook:PermissionRequest:wait` and is added only by `pnpm hooks install
--remote-approvals [--wait <seconds>]`; installing again without the flag removes it, `pnpm hooks remove` removes everything,
and `pnpm hooks status` reports it. The hook and its helper are installed as a private copy in `~/.aether/hooks/` (settings point
at the copy, not at the repository; `status` reports `modified` if the copy changed). Claude only: Codex has no equivalent here. There is no version gate: the design fails
safe (an older CLI that ignores the output simply shows its own prompt after the wait), and the schema was verified only on
2.1.289. The hook's fallback (offline, hung server, no config, bad input) is tested with the script run as a real child
process (`tests/aether/hook-approval.test.ts`).

## External observation readers

`apps/runner/src/observer.ts` provides bounded readers for transcripts outside AETHER's control.

- **Codex** requires a `session_meta` with a matching absolute `cwd` and a syntactically valid CLI version. It reads visible user and
  assistant text and function-call names; reasoning and non-visible channels are dropped; opaque new record and item families are ignored without extracting text; malformed known records are
  reported unsupported; parent and fork references are not followed.
- **Claude** requires conversation metadata with a syntactically valid version, a UUID session id and a matching absolute `cwd`. Only the
  approved file's entries are passed to the installed SDK's `getSessionMessages` with a read-only `sessionStore`; no model is
  started and only visible text blocks are emitted. This relies on the pinned SDK's alpha SessionStore API.
- Discovery is limited to 1,000 entries and six directory levels, never follows symlinks and never selects a home directory by
  default. Codex reads at most 256 KiB and 128 lines per poll with a 64 KiB line limit; Claude has a 2 MiB source ceiling.
  Exceeding a limit reports `limit_exceeded`, distinct from `unsupported_schema`.
- Partial UTF-8 and JSONL, reopening a cursor, stable source ids, inode rotation, truncation, deletion, path traversal and
  symlink rejection have real-file tests. Reader output never authorizes commands or marks managed work complete.

Compatibility is established with synthetic fixtures; no private provider file has been read.

## Model catalog

`GET /api/models` (any signed-in role) lists the models each CLI offers, so a new release appears without an AETHER update.
The CLIs' caches are private files with no format guarantee, so the readers (`packages/providers/src/models.ts`) skip every
field they do not recognise and never throw; a file over 2 MiB is ignored.

- **Codex**: `~/.codex/models_cache.json` (`AETHER_CODEX_HOME`). Only models with `visibility: "list"`, best `priority` first,
  with their reasoning levels and context window. When the cache is missing or its `fetched_at` is over 24 hours old, `codex debug models`
  is run (no shell, 5 second timeout, bounded output; it prints the local catalog and runs no model). If that fails the old
  cache is shown.
- **Claude Code**: the newest `~/.claude/cache/model-catalog/*cc.json` / `*ccd.json` (`AETHER_CLAUDE_HOME`): the main-section
  models with their effort options, plus `additionalModelOptionsCache` of `~/.claude.json` (the 1M-context variants; with
  `AETHER_CLAUDE_HOME` set, `<home>/.claude.json`). The aliases `fable`, `opus`, `sonnet`, `haiku` are always listed first, so
  there is a working choice with no cache at all. Aliases resolve to the newest model of their family inside the CLI; full IDs
  are shown to pin one.
- **Freshness**: each answer says its source (`cache`, `cli` or `fallback`) and when it was fetched, and is marked `stale`
  after 7 days. Answers are kept in memory for 30 seconds per source file (mtime and size), 10 minutes after a CLI probe;
  `?refresh=1` skips that.
- **Never written**: nothing is created or changed under `~/.claude` or `~/.codex`, no network request is made, and no account
  identifier, token or organization field is read into the answer.

## Signals for the office: what each provider gives, what is derived, what is missing

Read-only checks of the installed releases (Claude Code 2.1.289 binary and 756 real subagent files; Codex 0.160.1 binary and
real rollouts), bounded and never quoted. "Gives" is in the provider's own output; "derived" is computed by AETHER from it;
"unavailable" is not produced anywhere we read, and is `null` rather than guessed.

| Signal                                 | Claude Code                                                                                                                                                                                                                                                                                                                                              | Codex                                                                                                                                                                                                                                                                                                  | Status                                                                                                                                                            |
| -------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ | ----------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Command kind (`tags`)                  | `PreToolUse.tool_input.command`, or a `Grep` `pattern`, classified in the hook process; only labels from `COMMAND_TAGS` are spooled                                                                                                                                                                                                                      | `tool_input.cmd` / `command` (string or argument list), same classifier                                                                                                                                                                                                                                | derived (labels only, arguments dropped)                                                                                                                          |
| Tool outcome (`ok`)                    | gives: `PostToolUse` (the tool succeeded) and `PostToolUseFailure` (it failed; `is_interrupt` marks a stop by the person, recorded as unknown), both with `tool_use_id`; and `tool_result.is_error` in the transcript, read only when the flag is present (a command that exits non-zero is an error: `Exit code N`; a result with no flag says nothing) | the hook's `tool_response` is free-form JSON: `ok` only when it holds a numeric `exit_code` / `metadata.exit_code`; rollout outputs hold `exit_code` in `function_call_output` (JSON or `Exit code: N` text) and `custom_tool_call_output` (a JSON part with a top-level `exit_code`, the common case) | Claude: given. Codex: given only with an exit code, else unavailable                                                                                              |
| Pairing a result with its call         | by `tool_use_id`, exact                                                                                                                                                                                                                                                                                                                                  | by the hook's `tool_use_id` equal to the rollout's `call_id`: this equality was **not** verified (no hook payload is kept on disk), so a call that does not match stays `null`                                                                                                                         | Claude: verified shape. Codex: unverified, synthetic only                                                                                                         |
| `http.404` / `http.418` result labels  | none of the 9 WebFetch results found was an error, so the error text is unknown                                                                                                                                                                                                                                                                          | n/a                                                                                                                                                                                                                                                                                                    | unavailable, not built                                                                                                                                            |
| Subagent files                         | `<session>/subagents/agent-<id>.jsonl` (every line has `agentId: <id>` and `isSidechain: true`) and `agent-<id>.meta.json` (`agentType`, `description`, `toolUseId`, `spawnDepth`, and optionally `requestShape`, `model`, `parentAgentId`, `worktreePath`, `stoppedByUser`)                                                                             | the child rollouts already folded in by I1                                                                                                                                                                                                                                                             | file name `<id>` = the line `agentId` = the hook `agent_id` (the spool of this very engineer session names an `agentId` whose file exists under that name): given |
| Subagent label                         | `meta.description`                                                                                                                                                                                                                                                                                                                                       | n/a                                                                                                                                                                                                                                                                                                    | given (redacted, plain, 60 characters)                                                                                                                            |
| Subagent tokens, tools                 | `usage` and `tool_use` markers in the subagent's own lines, counted incrementally                                                                                                                                                                                                                                                                        | not built for rollouts                                                                                                                                                                                                                                                                                 | derived; `perMinute` is measured between scans and is 0 until two samples 10 s apart exist                                                                        |
| Subagent last words (`result.summary`) | the last assistant `text` block in a 128 KB tail (the last line is usually a `tool_result`, so it is not "the last line")                                                                                                                                                                                                                                | n/a                                                                                                                                                                                                                                                                                                    | derived (redacted, plain, 160 characters); only once finished                                                                                                     |
| Subagent `result.error`                | the parent's `tool_result.is_error` for `meta.toolUseId`; `false` only for a foreground call, since a background launch "succeeds" at once                                                                                                                                                                                                               | n/a                                                                                                                                                                                                                                                                                                    | derived, usually `null`                                                                                                                                           |
| Subagent finished                      | the hook's `SubagentStop`; without hooks only silence for 2 minutes (transcript lines carry no `stop_reason`)                                                                                                                                                                                                                                            | silence for 2 minutes                                                                                                                                                                                                                                                                                  | hook: given; files: derived                                                                                                                                       |
| Subagent nesting                       | `meta.parentAgentId` exists (51 of 756 files)                                                                                                                                                                                                                                                                                                            | `parent_thread_id`                                                                                                                                                                                                                                                                                     | present, not used: squads stay one level                                                                                                                          |
| Conflicted files (`git.conflicts`)     | unmerged codes (`UU AA DD AU UA DU UD`) of the `git status --porcelain=v1` the scan already runs                                                                                                                                                                                                                                                         | same                                                                                                                                                                                                                                                                                                   | derived, no new Git process                                                                                                                                       |
| Compaction / "PreCompact"              | the CLI has `PreCompact` and `PostCompact` hook events, which AETHER does not subscribe to; compaction stays the transcript marker (`usage.compactedAt`)                                                                                                                                                                                                 | `compacted`                                                                                                                                                                                                                                                                                            | no new signal invented                                                                                                                                            |

`pnpm hooks install` now also subscribes Claude to `PostToolUseFailure`; installs made earlier show it as missing in
`pnpm hooks status` until they are installed again.

## ACP and A2A

| Layer                                                | Wire protocol                                 | Package                          | Notes                                                                                                                                                                       |
| ---------------------------------------------------- | --------------------------------------------- | -------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| ACP client (`packages/providers/src/acp.ts`)         | ACP v1, selected by the agent at `initialize` | `@agentclientprotocol/sdk` 1.7.0 | Capabilities come from negotiation. `@agentclientprotocol/claude-agent-acp` and Gemini CLI negotiated v1 (initialize only, no model call). Not usable for read-only review. |
| A2A gateway (`apps/control/src/services/a2a/a2a.ts`) | A2A 1.0.0, JSON-RPC binding                   | `@a2a-js/sdk` 1.3.0              | Off unless `AETHER_A2A=on`. `SendMessage`, `GetTask`, `CancelTask`, `ListTasks`. No streaming, push or follow-up turns.                                                     |

The ACP wire version, the SDK version and the A2A spec version move independently; a test pins the ACP SDK version to the
installed package.
