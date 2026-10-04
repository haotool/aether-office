# Provider 相容性

## 查證於 2026-10-01

- 本機 Codex CLI `0.159.2`：已實際執行 `--version`、app-server help、generate-ts、generate-json-schema。生成結果在 `packages/providers/generated/`。這些命令沒有啟動模型回合。
- 本機 Claude Code `2.1.286`：已實際讀取 help/version。查 registry 得 Agent SDK `0.3.286`，依它的型別與官方 permission callback 實作；不使用私有 stdio 格式。
- Codex 文件 canonical URL：[Codex App Server](https://learn.chatgpt.com/docs/app-server)（由 developers.openai.com/codex/app-server redirect）。
- Claude：[programmatic CLI](https://code.claude.com/docs/en/headless)、[SDK permissions](https://code.claude.com/docs/en/agent-sdk/permissions)。

## 證據邊界

| 項目 | 實作 | 驗證 |
|---|---|---|
| Demo fixture | 真 subprocess、journal、控制台 API | 本機 process + HTTP browser E2E 已跑 |
| Codex native | 原生 app-server、worktree、runner journal、批准/事件橋接已接線 | synthetic 真程序測試通過；非 captured、非 live |
| Claude native | SDK adapter 已接 runner；訊息 normalizer 有測試 | 未執行模型；live 未授權 |
| PTY / Observe / ACP | 待完成 | not_run |

預設 runner 只公布 demo capability。Live runner 必須有 AETHER_NATIVE_CONFIG 指向明確 enabled:true 的本機 JSON，列出 repositories 與 codex/claude binary 絕對路徑；專案 owner 還須設定 project.execution.configure。只有具備兩層授權才會接 live 派工。上游原 server 不由產品 root scripts 啟動。

原生 start/resume 必須綁定該專案、worktree、AgentSession 和 provider thread；不將 sessionId/runId/threadId 當同一個 ID。Approval 保留 requestId，單次決策，拒絕 session-wide auto approval。工具結果錯誤與正常完成分開。輸入／輸出 token 的 usage 是可用資訊，模型內部 reasoning 不收集。

沒有使用 --yolo、--dangerously-skip-permissions 或自動切換付費 API。真模型驗證須明確額度授權；2026-10-04 已在授權下以 `pnpm run smoke:live` 跑過 Codex 0.160.0 與 Claude Code 2.1.288 的訂閱登入 smoke（見 NATIVE_EXECUTION.md）。


## External observation readers — 2026-10-01

`apps/runner/src/observer.ts` provides bounded readers wired through ObserverRunner, canonical observed-only ingestion and the external observation UI. No user transcript directory was scanned during development; tests use newly created temporary fixtures.

- Codex reader requires a `session_meta` with absolute matching cwd and CLI version `0.159.2`. It reads response-item visible user/assistant text and function-call names; reasoning and non-visible channels are dropped. Other record families are ignored or explicitly unsupported. It does not follow parent/fork references. Shape references: [Codex rollout recorder](https://github.com/openai/codex/blob/main/codex-rs/rollout/src/recorder.rs), [protocol types](https://github.com/openai/codex/blob/main/codex-rs/protocol/src/protocol.rs), and inspected hcom transcript parsers. Exact-version compatibility is only synthetic-fixture verified; actual private Codex log files have not been read or certified.
- Claude reader requires conversation metadata version `2.1.286`, UUID session ID and matching absolute cwd. It passes only the approved file's entries through the installed official SDK `getSessionMessages` with a read-only `sessionStore`; the SDK reconstructs parentUuid chains. No query/model process is started. Only visible text blocks are emitted. This depends on the pinned SDK's alpha SessionStore API and still needs actual approved-file compatibility evidence.
- Discovery is limited to 1,000 entries and six nested directory levels, does not follow normal symlinks, and never selects a default home directory. Codex reads at most 256 KiB and 128 lines per poll, with 64 KiB line limit. Claude currently has a 2 MiB source-file ceiling. Resource ceilings report `limit_exceeded`, separately from `unsupported_schema`.
- Partial UTF-8/JSONL, reopen cursor, stable source IDs, inode rotation, truncation/prefix replacement, deletion, path traversal and symlink rejection have real-file tests. Arbitrary edits in the already-consumed middle of an unchanged file are not a complete audit/replay mechanism.

Remaining: GUI-based local grant setup/selection (configuration is currently machine-local JSON), larger-file support, and actual provider-file compatibility checks. Canonical ingestion, atomic checkpoint/pending batches, nonblocking runner scheduling, observed provenance and stale/offline UI are implemented and tested with explicit fixtures. Reader output must never authorize commands or mark managed work completed.

## ACP and A2A versions (recorded separately)

| Layer | Wire protocol | Package (exact) | Notes |
|---|---|---|---|
| ACP client (`packages/providers/src/acp.ts`) | ACP v1 (`PROTOCOL_VERSION` 1, agent selects at `initialize`) | `@agentclientprotocol/sdk` 1.7.0 | Capabilities come from negotiation. Real `@agentclientprotocol/claude-agent-acp` 0.85.1 negotiated v1 with resume, image, embeddedContext and MCP advertised (initialize only, no model call). Real Gemini CLI 0.46.0 (`acpAgent: { command: "/opt/homebrew/bin/gemini", args: ["--acp"] }`) negotiated v1 with resume, image, audio, embeddedContext and MCP, auth methods oauth-personal / gemini-api-key / vertex-ai / gateway (2026-10-04, initialize only). Not usable for read-only review. |
| A2A gateway (`apps/control/src/services/a2a.ts`) | A2A spec 1.0.0, JSON-RPC binding | `@a2a-js/sdk` 1.3.0 | Off unless `AETHER_A2A=on`. Methods: SendMessage, GetTask, CancelTask, ListTasks. No streaming, push, or follow-up turns. |

The ACP wire version, the SDK semver and the A2A spec version move independently; a test pins the ACP SDK semver to the installed package.

## Verified provider CLI releases

`packages/providers/generated/compat.json` is the single list of provider releases the adapters, the transcript observers and `pnpm run doctor` accept. Codex is matched by exact release (its generated protocol types for 0.160.0 are byte-identical to 0.159.2, checked by `tests/aether/codex-schema.test.ts` against the installed binary). Claude Code is matched per minor series (2.1.x) because the contract is the exactly pinned `@anthropic-ai/claude-agent-sdk`. Before this list existed the adapters hard-coded one patch release each and would have refused the installed Codex 0.160.0 and Claude Code 2.1.288. To add a release: install it, run `pnpm run doctor` and the provider tests, then add it here.
