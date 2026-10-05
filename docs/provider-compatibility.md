# Provider compatibility

AETHER OFFICE integrates with agent CLIs through their official interfaces only: the Codex app-server protocol, the Claude
Agent SDK, ACP, and the hook mechanisms of Claude Code and Codex. It does not parse private stdio formats.

## Verified releases

`packages/providers/generated/compat.json` is the single list of provider releases that the adapters, the transcript observers
and `pnpm run doctor` accept.

- **Codex** is matched by exact release. The generated protocol types for 0.160.0 are byte-identical to 0.159.2, which
  `tests/aether/codex-schema.test.ts` checks against the installed binary. Generated artifacts live in
  `packages/providers/generated/`.
- **Claude Code** is matched per minor series (2.1.x), because the contract is the exactly pinned
  `@anthropic-ai/claude-agent-sdk`.

To add a release: install it, run `pnpm run doctor` and the provider tests, then add it to `compat.json`. A version that is not
listed is refused rather than assumed compatible.

Reference documentation: [Codex App Server](https://learn.chatgpt.com/docs/app-server),
[Claude programmatic CLI](https://code.claude.com/docs/en/headless) and
[Agent SDK permissions](https://code.claude.com/docs/en/agent-sdk/permissions).

## What is implemented and how it is verified

| Capability              | Implementation                                                                 | Verification                                                              |
| ----------------------- | ------------------------------------------------------------------------------ | ------------------------------------------------------------------------- |
| Demo fixture            | Real subprocess, journal and control-plane API                                 | Local process and HTTP browser end-to-end tests                           |
| Codex native            | App-server, worktrees, runner journal, approval and event bridge               | Synthetic real-process tests; a live smoke test on the installed CLI      |
| Claude native           | SDK adapter wired to the runner; message normalizer tested                     | Unit tests; a live smoke test on the installed CLI                        |
| PTY, observation, ACP   | See [native execution](native-execution.md)                                    | Real PTY and real-file tests; ACP initialize against real adapters        |

A runner publishes only the demo capability by default. A live runner needs `AETHER_NATIVE_CONFIG` pointing at a local JSON file
with `enabled: true`, plus an explicit per-project opt-in by the owner; both are required before live work is dispatched.

Native start and resume bind to the project, worktree, agent session and provider thread; `sessionId`, `runId` and `threadId`
are never treated as one id. Approvals keep their request id and are decided once; session-wide auto-approval is refused. Tool
errors are distinct from normal completion. Input and output token usage is recorded when available; model reasoning is not
collected. No `--yolo`, `--dangerously-skip-permissions` or automatic switch to a paid API exists anywhere.

## External observation readers

`apps/runner/src/observer.ts` provides bounded readers for transcripts outside AETHER's control.

- **Codex** requires a `session_meta` with a matching absolute `cwd` and a verified CLI version. It reads visible user and
  assistant text and function-call names; reasoning and non-visible channels are dropped; other record families are ignored or
  reported unsupported; parent and fork references are not followed.
- **Claude** requires conversation metadata with a verified version, a UUID session id and a matching absolute `cwd`. Only the
  approved file's entries are passed to the installed SDK's `getSessionMessages` with a read-only `sessionStore`; no model is
  started and only visible text blocks are emitted. This relies on the pinned SDK's alpha SessionStore API.
- Discovery is limited to 1,000 entries and six directory levels, never follows symlinks and never selects a home directory by
  default. Codex reads at most 256 KiB and 128 lines per poll with a 64 KiB line limit; Claude has a 2 MiB source ceiling.
  Exceeding a limit reports `limit_exceeded`, distinct from `unsupported_schema`.
- Partial UTF-8 and JSONL, reopening a cursor, stable source ids, inode rotation, truncation, deletion, path traversal and
  symlink rejection have real-file tests. Reader output never authorizes commands or marks managed work complete.

Compatibility is established with synthetic fixtures; no private provider file has been read.

## ACP and A2A

| Layer                                        | Wire protocol                           | Package                       | Notes                                                                                                                       |
| -------------------------------------------- | --------------------------------------- | ----------------------------- | --------------------------------------------------------------------------------------------------------------------------- |
| ACP client (`packages/providers/src/acp.ts`) | ACP v1, selected by the agent at `initialize` | `@agentclientprotocol/sdk` 1.7.0 | Capabilities come from negotiation. `@agentclientprotocol/claude-agent-acp` and Gemini CLI negotiated v1 (initialize only, no model call). Not usable for read-only review. |
| A2A gateway (`apps/control/src/services/a2a.ts`) | A2A 1.0.0, JSON-RPC binding        | `@a2a-js/sdk` 1.3.0           | Off unless `AETHER_A2A=on`. `SendMessage`, `GetTask`, `CancelTask`, `ListTasks`. No streaming, push or follow-up turns.      |

The ACP wire version, the SDK version and the A2A spec version move independently; a test pins the ACP SDK version to the
installed package.
