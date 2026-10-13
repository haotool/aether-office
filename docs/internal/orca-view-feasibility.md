# Orca 唯讀 3D 辦公室視圖：可行性研究（方案 B）

[文件索引](../README.md) · [專案首頁](../../README.zh-TW.md)

> [!NOTE]
> 此文件為當時版本的設計與研究紀錄；提案、量測及實作觀察不代表目前版本的支援狀態。
> 現行操作方式與驗證結果，請以操作指南及功能驗證台帳為準。

<details>
<summary>目錄</summary>

- [1. 結論先行](#1-結論先行)
- [2. 證據表：Orca 把事實放在哪裡](#2-證據表orca-把事實放在哪裡)
- [3. 整合方案排序](#3-整合方案排序)
- [4. 與 AETHER 模型的對應](#4-與-aether-模型的對應)
- [5. 本機實測（只列存在與否）](#5-本機實測只列存在與否)
- [6. 相容性與風險](#6-相容性與風險)
- [7. 分階段計畫與 go / no-go](#7-分階段計畫與-go--no-go)
- [8. 決策](#8-決策)

</details>

日期：2026-10-07。性質：唯讀研究，未改任何程式碼，未執行 Orca，未連網。
範圍：Orca 本機 clone（https://github.com/stablyai/orca，MIT，commit `373d951b`，2026-09-30，`package.json:3` 版本 1.4.214）；本 repo 為 AETHER OFFICE。
標記：**[已驗證]** 讀過程式碼或文件原文；**[推論]** 由程式碼合理推得但未執行；**[未知]** 需實測。
下文 `orca:` 前綴指該 clone 的根目錄（不在本 repo；用 `git clone --depth 1` 取得後 `git fetch --depth 1 origin <完整 SHA>` 並 checkout，完整 SHA 在 `docs/research/repo-selection-2026-10-01/matrix.json` 的 `localSha`）。這個 clone 只有 1 個 commit（淺層），無法從 git log 量測更新頻率。

## 1. 結論先行

**有條件可行。** 把 Orca 的 worktree、agent 狀態當作一個「來源」疊加到現有辦公室是可做的，但關鍵發現是：
Orca 自己顯示的 agent 狀態，來源就是 Claude Code / Codex 的 hook 與 transcript，而 AETHER 已經在讀同一批來源，
再用 `git worktree` 的 common dir 把 session 歸到 worktree（`packages/contracts/src/sessions.ts:97-100`）。
所以由 Orca 啟動的 agent，AETHER 現在就能看到，缺的只是 Orca 才有的「名稱與脈絡」（workspace 顯示名稱、備註、狀態欄、PR/issue 連結、父子 worktree、遠端 SSH/WSL 主機上的 agent、orchestration 任務標題）。
因此方案 B 的實質是「薄的 Orca 疊加層」，不是新的資料管線。Orca 內部狀態沒有穩定公開的檔案介面，唯一接近公開的是 `orca` CLI（官網文件有列、有協定版本與相容視窗）。
建議路徑：以 (c) 為主，加上 (b) 的 CLI 疊加；不建議直接讀 Orca 檔案 (a)。

**要先決定或驗證的三個最大未知：**

1. **CLI 能否被 AETHER 穩定、無副作用地呼叫。** 本機沒有 Orca，所以 `orca worktree ps --json` 的實際輸出、執行成本、認證範圍（CLI 用的是具完整權限的 token）都沒實測。Phase 0 必須在裝有 Orca 的機器上做。
2. **Orca 啟動的 agent 行程，其環境變數 `ORCA_WORKTREE_ID` / `ORCA_PANE_KEY` 是否會被 AETHER 的 hook 看到，以及兩套 `PermissionRequest` hook 同時存在時誰的回答生效。** 前者決定能否零檔案讀取就拿到精確的 worktree/pane 對應；後者決定遠端核准在 Orca 底下是否仍可用。
3. **產品決策：疊加層值得做嗎？** 若使用者的 agent 都在本機、只想看動物，(c) 已涵蓋，疊加層只增加名稱與 PR 連結；若需要遠端 SSH 主機上的 agent 才有 B 的獨特價值，而那正是最難且最依賴 Orca 內部的部分。

## 2. 證據表：Orca 把事實放在哪裡

| #   | 事實                                                                                          | 位置（file:line）                                                                                                                                                                                 | 格式 / 更新方式                                                                                                                                                                                                                                                                                                          | 穩定性                                                                                                          | 標記                              |
| --- | --------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ | --------------------------------------------------------------------------------------------------------------- | --------------------------------- |
| 1   | 每 pane 的 agent 狀態（含 prompt、最後回覆、tool、model、worktreeId、tabId、paneKey、時間戳） | `orca:src/main/agent-hooks/server/server-persistence.ts:17-95`（序列化）、`:110-127`（寫入）；型別 `orca:src/shared/agent-status-types.ts:76-150`                                                 | `<userData>/agent-hooks/[namespace/]last-status.json`，`{version:2, entries, authorityCommitments}`；先寫 tmp 再 rename（原子），權限 0600，事件停止 250 ms 後才寫（`server-constants.ts:4,11,14`）；路徑組成 `server-runtime-env.ts:52-62`                                                                              | 內部。設計文件稱它是「主程序的 hook server store」（`orca:docs/reference/agent-status-store.md`），沒有對外承諾 | 已驗證                            |
| 2   | 同上檔案的限制                                                                                | `server-persistence.ts:32`（結構化 session 不寫入）、`server-constants.ts:23`（只回補 7 天）、`agent-status-types.ts` 的 `restoredUnconfirmed`                                                    | 重啟後讀回的 nonterminal 列會被標成未確認；結構化（原生聊天）session 完全不在此檔                                                                                                                                                                                                                                        | 內部                                                                                                            | 已驗證                            |
| 3   | 狀態集合                                                                                      | `orca:src/shared/agent-status-types.ts:51`                                                                                                                                                        | `working / blocked / waiting / done`，另有 `interrupted` 旗標。**沒有 error 狀態**                                                                                                                                                                                                                                       | 內部型別                                                                                                        | 已驗證                            |
| 4   | 原始 hook 事件                                                                                | `orca:src/main/agent-hooks/hook-stdin-contract.ts:145-157`；`orca:src/shared/agent-hook-spool.ts:1-30`                                                                                            | `<userData>/agent-hooks/spool/pane-<id>.jsonl`，每行含 paneKey、tabId、worktreeId、payload、receivedAt；單檔 5 MB、7 天、1024 檔上限                                                                                                                                                                                     | 內部（含完整 payload，內容敏感）                                                                                | 已驗證                            |
| 5   | HTTP hook 端點                                                                                | `orca:src/shared/agent-hook-endpoint-file.ts:1-40`                                                                                                                                                | `endpoint.env`：port、token、env、version；本機 loopback，token 為密鑰                                                                                                                                                                                                                                                   | 內部，僅供 Orca 自己的 hook script                                                                              | 已驗證                            |
| 6   | 主資料（repos、worktrees、中繼資料、session）                                                 | `orca:src/main/persistence/loading-store/user-data-path.ts:15-16`；`orca:src/main/persistence/profile-state/legacy-json/README.md:1-5,20-24`                                                      | **SQLite（`profile-state.db`）是唯一可寫後端**；`orca-data.json` 只在乾淨關閉或維護時匯出，崩潰後可能過期。路徑為 `profiles/<id>/` 之下（`profile-state-access.ts:33-38`）                                                                                                                                               | 內部。直接讀 SQLite 或 JSON 都不可取                                                                            | 已驗證                            |
| 7   | 對外 CLI                                                                                      | `orca:src/cli/specs/core.ts:20,69,188,196,212`；官方文件 `orca:docs/site/content/docs/cli/overview.mdx:15,33-53`、`reference.mdx:91-101`                                                          | `orca status / worktree list / worktree ps / terminal list / terminal read` 均有 `--json`。文件把它定位為「從任何 shell 腳本化控制執行中的 Orca」                                                                                                                                                                        | **文件化**，是最接近穩定介面者                                                                                  | 已驗證                            |
| 8   | CLI 的傳輸                                                                                    | `orca:src/shared/runtime-bootstrap.ts:17-23,45`；`orca:src/cli/runtime/metadata.ts:42-56`                                                                                                         | CLI 讀 `<userData>/orca-runtime.json`（`runtimeId、pid、transports[unix/named-pipe/websocket]、authToken、startedAt`），經 unix socket / named pipe 呼叫 RPC。`ORCA_USER_DATA_PATH` 可指定實例                                                                                                                           | 內部檔案，但有舊格式相容碼；**內含 authToken，AETHER 不應直接讀**                                               | 已驗證                            |
| 9   | RPC 版本與相容規則                                                                            | `orca:src/shared/protocol-version.ts:34`（`RUNTIME_PROTOCOL_VERSION = 3`，最低相容 client/server 2）；`orca:docs/reference/remote-wire-compatibility.md:1-20`                                     | 新增方法或可選欄位不升版；移除方法、改欄位語意才升版。「混版是常態」                                                                                                                                                                                                                                                     | **有明文契約**（對 Orca 自己的 client 而言）                                                                    | 已驗證                            |
| 10  | `worktree ps` 回傳形狀                                                                        | `orca:src/shared/runtime-worktree-contracts.ts:13-36`（agent row）、`:38-68`（worktree summary）；組裝 `orca:src/main/runtime/runtime-worktree-agent-rows.ts:44-76`                               | 每個 worktree：`worktreeId、repoId、repo、path、branch、isArchived、parentWorktreeId、childWorktreeIds、displayName、workspaceStatus、lastActivityAt、linkedPR…` 加 agent rows：`paneKey、state、agentType、prompt、lastAssistantMessage、toolName、stateStartedAt、updatedAt、restoredUnconfirmed、structuredHostOwned` | CLI 輸出，隨 Orca 版本增欄                                                                                      | 已驗證（型別）；實際輸出 **未知** |
| 11  | token / 用量                                                                                  | `orca:src/main/claude-usage/transcript-file-discovery.ts:5-6`、`worktree-attribution.ts:1-40`；`orca:src/main/codex-usage/codex-session-file-discovery.ts`                                        | Orca 自己掃 `~/.claude/projects` 與 Codex rollout，再用 cwd 路徑對應 worktree。**用量不在 Orca 的狀態檔裡，是現算的**                                                                                                                                                                                                    | 內部                                                                                                            | 已驗證                            |
| 12  | worktree 預設位置                                                                             | `orca:src/shared/constants.ts:107`                                                                                                                                                                | `~/orca/workspaces/<repo>/<worktree>`（可改）                                                                                                                                                                                                                                                                            | 預設值                                                                                                          | 已驗證                            |
| 13  | pty / terminal id                                                                             | `orca:src/main/providers/local-pty-launch-helpers.ts:8-13`（`ORCA_PANE_KEY、ORCA_TAB_ID、ORCA_WORKTREE_ID、ORCA_AGENT_LAUNCH_TOKEN` 注入 PTY 環境）；terminal handle 由 `orca terminal list` 提供 | 環境變數與 CLI                                                                                                                                                                                                                                                                                                           | 內部                                                                                                            | 已驗證                            |
| 14  | daemon（PTY 常駐程序）                                                                        | `orca:src/main/daemon/daemon-checkpoint-file.ts`、`daemon-durable-history-snapshot.ts`                                                                                                            | 終端歷史檢查點，非 agent 狀態                                                                                                                                                                                                                                                                                            | 內部                                                                                                            | 已驗證（僅看檔名與位置）          |
| 15  | mobile 同伴協定                                                                               | `orca:mobile/README.md`（WebSocket RPC 預設 6768）；`orca:src/main/runtime/rpc/e2ee-channel.ts:42`（scope `mobile`/`runtime`）                                                                    | 需配對、E2EE、方法白名單                                                                                                                                                                                                                                                                                                 | 內部，專為 Orca 手機 app                                                                                        | 已驗證；不建議使用                |
| 16  | `orca.yaml`                                                                                   | `orca:orca.yaml:1-4`；`orca:src/main/effective-hook-config.ts:1-50`                                                                                                                               | 只是 repo 的 setup / archive 指令碼設定，**與 agent 狀態無關**                                                                                                                                                                                                                                                           | 使用者設定                                                                                                      | 已驗證（先前的假設不成立）        |
| 17  | Orca 裝進 Claude/Codex 的 hook                                                                | `orca:src/main/claude/hook-settings.ts:39-41`（`~/.claude/settings.json`）、`:147-177`（apply）、`:183-213`（statusLine）                                                                         | 在每個事件的陣列後面附加，先以 script 檔名比對清掉自己舊的；不動別人的條目；使用者自有的 `statusLine` 不覆寫                                                                                                                                                                                                             | 內部行為                                                                                                        | 已驗證                            |
| 18  | skills                                                                                        | `orca:skills/orca-cli/SKILL.md`、`orca:skill-guides/`                                                                                                                                             | 教 agent 使用 `orca` CLI；不是資料來源                                                                                                                                                                                                                                                                                   | 文件                                                                                                            | 已驗證                            |

重點判讀：

- **唯一「即時且落地」的狀態檔是 #1**，但它是內部檔、含 prompt 與回覆全文、不含原生聊天 session、重啟後還有未確認標記。直接讀它等於綁死在 Orca 的內部序列化上。
- **#6 主資料是 SQLite**，且 JSON 匯出只在乾淨關閉時更新，不能當即時來源。
- **#7 + #9 是最穩的**：有文件、有協定版本、有 `--json`；代價是需要 Orca 正在執行、`orca` 在 PATH、而且它的認證 token 是完整權限。

## 3. 整合方案排序

### (c) 與 Orca 同源：Claude / Codex transcript 與 hook + 薄映射（建議主路徑）

- **資料流**：現有 `~/.claude`、`~/.codex` 掃描 + `~/.aether/hook-events.jsonl`（`docs/architecture.md` 資料流 1）→ `worktree` 欄位已由 git common dir 算出（`sessions.ts:97-100`）→ 以 cwd 前綴判斷是否位於 Orca 的 workspace 根目錄（預設 `~/orca/workspaces`，可由使用者設定）→ 在 UI 標為「來源：Orca」。
- **加強（d-lite）**：AETHER 的 hook 是在 agent 行程內執行的，Orca 啟動的 PTY 把 `ORCA_WORKTREE_ID`、`ORCA_PANE_KEY` 放進環境（證據 #13）。**[推論]** hook 子行程會繼承這些變數，讓 AETHER 的 hook 只多記兩個欄位，就能拿到精確的 Orca worktree id 與 pane，而不必讀 Orca 的任何檔案。需 Phase 0 實測。
- **工作量**：1–2 天（路徑判定、來源徽章、hook 多記 2 欄位並過 `recordSchema`）。
- **失敗模式**：使用者自訂 workspace 目錄（需設定項）；遠端 SSH/WSL agent 看不到（transcript 在別台機器）；Orca 以外也使用 `~/orca` 的人（誤標，只影響徽章）。
- **AETHER 已具備**：session 發現、worktree 歸屬（含 `linked`）、liveness、hook spool、speech、KPI、context gauge、squads、clock-out。

### (b) 呼叫 Orca CLI 作為疊加層（建議的補強與備援）

- **資料流**：`execFile('orca', ['status','--json'])` 做版本探測；每 2–5 秒（或只在有 Orca 來源 session 時）`orca worktree ps --json` 與 `worktree list --json` → zod 容錯解析（忽略未知欄位）→ 以 `path` 與 session 的 `worktree.root` 對齊 → 補上 displayName、workspaceStatus、父子、PR/issue、orchestration 任務標題、遠端主機。
- **工作量**：3–4 天（不含 UI）。
- **失敗模式**：`orca` 不在 PATH 或 app 未啟動（優雅退回 (c)）；CLI 輸出欄位變動（容錯 + 版本探測 + 降級）；呼叫成本未知（需節流，不得每次 2 秒掃描都呼叫）；認證 token 權限過大（只用固定參數、不接受使用者輸入、不經 shell）；輸出含 prompt 與回覆全文，必須走 AETHER 既有的 redaction 與文字管線（`apps/control/src/services/platform/redaction.ts`）。
- **為何不直接讀 `orca-runtime.json` 自己講 RPC**：該檔含 authToken，自己實作傳輸等於把內部協定與完整權限收進 AETHER。

### (a) 直接讀 Orca 狀態檔（不建議，僅列為最後備援）

- 可讀的只有 `last-status.json`（證據 #1、#2）：內部格式、含敏感全文、缺原生聊天 session、重啟後半過期。版本欄位 `version: 2` 是唯一防線。
- 工作量 2–3 天；失敗模式是靜默讀到過期或殘缺狀態。若 (b) 不可用且使用者仍要 Orca 名稱，才考慮只讀 `worktreeId/state/updatedAt` 三欄，並把 `restoredUnconfirmed` 視為未知。

### (d) 並存安裝 hook（是 (c) 的前提條件，已確認不衝突）

- **[已驗證]** Orca：每個事件陣列附加自己的條目，只清除自己舊的（以 script 檔名比對，`hook-settings.ts:147-177`）；不覆寫使用者自有 `statusLine`（`:204-213`）。AETHER：以 `aether-office-hook` 標記識別自己的條目，其餘不動（`packages/providers/src/claude-hooks.ts:9,38`）。兩者互不刪對方。
- **[已驗證]** Orca 的 hook script 只在有 `ORCA_PANE_KEY` 的 Orca pane 內才送事件（`hook-stdin-contract.ts:145`）。
- **[未知]** 兩個 `PermissionRequest` hook 同時存在時，Claude Code 取誰的輸出。Orca 的 script 在 Windows 版會先 `echo {}`（`orca:src/main/claude/hook-script.ts`），因為 permission hook 對空輸出會 fail closed。遠端核准在 Orca 之下是否仍可用，必須實測。

**建議：主路徑 (c)（含 d-lite），備援／加值 (b)；(a) 不納入計畫。**

## 4. 與 AETHER 模型的對應

| Orca                                        | AETHER                                          | 說明                                                                                                               |
| ------------------------------------------- | ----------------------------------------------- | ------------------------------------------------------------------------------------------------------------------ |
| repo / project                              | project（`worktree.project`、`worktree.main`）  | 以 git common dir 對齊，已存在                                                                                     |
| worktree（`worktreeId = <repoId>::<path>`） | `LocalSession.worktree.root`、`worktree.linked` | 路徑相等即對上；`displayName`、`workspaceStatus` 為新增欄位                                                        |
| 父子 worktree                               | 無現成對應                                      | 可作為 squad 之外的關係線（`RelationLines`），需新欄位                                                             |
| workspace / tab / pane（`paneKey`）         | 無；一個 pane 對應一個 session                  | 只作為關聯鍵，不需成為模型                                                                                         |
| agent row（state）                          | session 的 `hook.activity`                      | `working→working`、`waiting`/`blocked→waiting_permission`、`done→idle`；Orca 無 error 狀態；`interrupted` 對應中斷 |
| subagents（`subagents` / `children`）       | `subagentSchema` → squad                        | 概念相同，AETHER 已由 hook 與 rollout 推得                                                                         |
| orchestration task / dispatch               | 無                                              | 可作為辦公室名牌文字                                                                                               |
| 遠端主機（SSH relay / WSL）                 | 無                                              | 只有 (b) 能看到，且資料在本機 Orca 的鏡像中                                                                        |

**不變即可運作（皆來自 AETHER 自己的來源）**：說話泡泡（最後 prompt/回覆）、KPI 與用量、context gauge、squads、liveness、角色與樓層。

**無法做（寫入類）**：composer 輸入（AETHER 只對自己的終端打字，`docs/architecture.md`「Driving a session」）、遠端核准（受 d 的未知影響）、clock-out 終止（AETHER 的 stop 是直接對行程操作，技術上現有；但對 Orca 管理的行程是否該動，屬產品決策，建議在唯讀模式下停用）、終端連結。

**之後是否可經 Orca 寫入**：**[已驗證]** CLI 有 `terminal send`、`terminal close`、`worktree rm`（`orca:docs/site/content/docs/cli/overview.mdx:51-53`、`reference.mdx:100`）。這些可在 Phase 3 作為「經由 Orca 送字」的通道，但需要 `--terminal <handle>`（來自 `terminal list`）與完整權限的 CLI 認證，風險高於讀取。

## 5. 本機實測（只列存在與否）

| 檢查                                                                                                                                                                       | 結果                    |
| -------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ----------------------- |
| Orca 的 userData：`~/Library/Application Support/orca`、`Orca`、`orca-dev`（app 名稱 `Orca`，`appId com.stablyai.orca`，`orca:config/electron-builder.config.cjs:77,175`） | 皆不存在                |
| `~/orca`（預設 workspace 根）、`~/.orca`、`~/.config/orca`、`~/Library/Caches/orca`、`~/Library/Logs/orca`、偏好設定 plist                                                 | 皆不存在                |
| `/Applications/Orca.app`、`~/Applications/Orca.app`、PATH 上的 `orca` / `orca-dev`                                                                                         | 皆不存在                |
| `~/.claude/settings.json` 中含 "orca" 的行數（僅計數，未讀內容）                                                                                                           | 0                       |
| `~/.claude/hooks` 內名稱含 orca 的檔案                                                                                                                                     | 無                      |
| 本機 AETHER 側：`~/.aether/hook-events.jsonl`、`hook-events.jsonl.1`                                                                                                       | 存在（既有 hook spool） |

結論：**本機沒有安裝 Orca，也沒有任何 Orca 資料目錄，所以第 2、3 節所有標「已驗證」的項目都只來自讀原始碼，沒有一項在真機上跑過。** Phase 0 需要一台裝了 Orca 的機器。

## 6. 相容性與風險

- **更新頻率**：版本 1.4.214（`package.json:3`），同一 minor 已有 200+ patch，另有 `orca@rc` cask（`orca:Casks/orca@rc.rb`）。**[推論]** 發版很密。clone 為淺層，無法由 git 量測。
- **破壞性變更風險**：檔案格式（#1、#4、#6）無承諾，風險高；CLI 與 RPC 有版本與相容規則（#9），風險中低，但這個規則保護的是 Orca 自己的 client，不是第三方 JSON 消費者。可依賴的是「新增欄位不升版」，所以我們的解析必須忽略未知欄位並容許缺欄位。
- **跨平台**：macOS `~/Library/Application Support/orca`；Windows `%APPDATA%\orca`；Linux 依 Electron 預設（`orca:src/cli/runtime/metadata.ts:42-70`）。Windows 與 WSL 還有專屬路徑與 hook relay（`orca:src/main/agent-hooks/wsl-hook-relay-*.ts`）。使用 CLI 可避開所有路徑差異，這是 (b) 的另一個優點。AETHER 自己的 `~/.claude` 掃描在 WSL 下本來就看不到 Windows 側。
- **多機／遠端**：**[已驗證]** Orca 的設計是「執行主機擁有狀態，client 鏡像」（`agent-status-store.md`），SSH/relay 上的 agent 狀態經 hook relay 流回本機 Orca。所以資料「在本機 Orca 內」，但 transcript 與 `~/.claude` 在遠端，(c) 看不到，只有 (b) 能看到狀態（看不到 transcript 全文，因此說話泡泡與 KPI 對遠端 agent 不完整）。`orca serve` 可無頭執行（`orca:docs/reference/headless-linux-server.md`）。
- **隱私**：CLI 與 `last-status.json` 回傳 prompt 與回覆全文；`orca-runtime.json` 與 `endpoint.env` 含 token。AETHER 不得讀取後兩者，前兩者必須走既有的 redaction。
- **授權**：Orca 為 MIT。若只自寫 zod schema 與呼叫 CLI，不複製程式碼，不產生新義務。若複製其型別定義或程式碼：保留版權聲明（`NOTICE` 與 `THIRD_PARTY_NOTICES.md` 已有 Orca 項，現為 redaction 一處），更新 `docs/legal/provenance.md`，並跑 `scripts/oss/overlap-scan.mjs`（`docs/legal/provenance.md` 的 50 token 門檻）。`docs/research/SOURCES.json` 內 Orca 的 `codeReuse` 欄位與現況不一致，已在 provenance 中說明，再有複製時要同步。
- **商標**：「Orca」與其標誌不得作為本專案名稱或圖示；UI 只能做指稱式提及（例如來源徽章寫「Orca」文字），不用其 logo。補一行到 `docs/legal/trademarks.md`。

## 7. 分階段計畫與 go / no-go

### Phase 0：探針（1 天，須在裝有 Orca 的機器）

- 內容：不改 repo 程式碼，用腳本呼叫 `orca status --json`、`worktree ps --json`、`worktree list --json`，與 AETHER `GET /api/local-sessions` 以 path 對齊；在 Orca 啟動的 agent 內讓 AETHER hook 印出環境變數**名稱**（不印值）確認是否繼承；同時裝兩套 `PermissionRequest` hook 看行為。
- **Go**：(1) CLI 輸出可在 2 秒內回來且不改變 Orca 狀態；(2) 至少 `worktreeId/path/branch/displayName` 與一個 agent row 可對上 AETHER session；(3) 未知欄位不致壞掉解析。
- **Stop**：CLI 需要互動式登入或會拉起 Orca 視窗；`worktree ps` 在大型 workspace 超過 5 秒；JSON 不是穩定可解析的單一物件；若 (c) 單獨已滿足需求，則停在 (c)。

### Phase 1：adapter 邊界（約 3–4 天）

- 放在 `apps/control/src/services/orca-source.ts`（control 才有 Node I/O；`packages/providers` 不得 import control，`docs/architecture.md` 的模組邊界）。含：`probe()`（`orca status --json` 取版本與協定）、`snapshot()`（`execFile`、固定參數、逾時、輸出大小上限）、zod `passthrough` 的容錯 schema、依 mtime 無法使用所以用 TTL 快取（2–5 秒）、錯誤分類（not_installed / not_running / incompatible / timeout）與優雅降級。
- 會動的檔案：
  - 新增 `apps/control/src/services/orca-source.ts`；
  - `packages/contracts/src/sessions.ts`：`localSessionSchema` 加可選的 `orca` 物件（`worktreeId、displayName、workspaceStatus、parentWorktreeId、host`）與來源種類，保持向後相容（可選、預設 null）；
  - `apps/control/src/services/runtime/local-sessions.ts`：以 path 對齊並合併；
  - `apps/control/src/services/sessions/session-changes.ts`：新增 change kind（例如 `source`）；
  - `apps/control/src/routes`：`/api/system` 或新的 sources 端點回報探測狀態；
  - `scripts/doctor`：加 Orca 偵測；
  - 設定項（`docs/configuration.md`）：例如 `AETHER_ORCA=auto|off` 與 workspace 根目錄覆寫。
- 測試：`tests/aether/orca-source.test.ts`（以固定樣本餵解析器：缺欄、多欄、空輸出、壞 JSON、逾時、舊版本）；`tests/aether` 的 local-session 相容測試擴充；contract 測試確認舊 client 讀得懂；`check-boundaries` 通過；`pnpm run notices` 無變更。
- **Stop**：需要複製 Orca 程式碼才做得出來；或 schema 每個小版本就壞。

### Phase 2：UX（約 2–3 天）

- 使用者看到的：session 面板與動物名牌上的「來源：Orca」徽章；設定頁的 Orca 來源開關與探測狀態（未安裝 / 未執行 / 版本不相容 / 正常，各有說明）；空狀態文案；辦公室名牌可用 worktree displayName；`workspaceStatus` 與 PR 連結顯示在面板。
- 會動的檔案：`apps/web/src/features/office/office-model.ts`（名稱與徽章）、`PhoneOffice.tsx` / `OfficePage.tsx`、設定頁、`apps/web/src/i18n`（zh-TW 與 English 兩語）、`docs/features.md`、`docs/provider-compatibility.md`（記錄已驗證的 Orca 版本）、`CHANGELOG.md`、`docs/verification/features.json`（實作與驗證分欄，未實測者不得標通過）。
- 測試：i18n 完整性、responsive 與 a11y spec（`AGENTS.md` 的 UI 規則）、一個 Playwright 流程（有 / 無 Orca 來源）、截圖確認手機與平板。
- **Stop**：徽章或名稱導致 3D 場景效能預算退步（`PerfProbe`）。

### Phase 3：選配的寫入（≥4 天，建議延後）

- 只有在 Phase 0–2 穩定、且有人要求時才做：經 `orca terminal send --terminal <handle>` 送字，取代 AETHER 自己的終端連結；其餘（核准、clock-out、`worktree rm`）建議維持唯讀。
- 需要的前置：威脅模型更新（`docs/security.md`）、CLI 認證範圍確認（有無唯讀 scope，**[未知]**）、`terminal list` 與 session 的對應規則、命令走既有 `POST /api/commands` 與 CSRF 流程。
- **Stop**：Orca 無法限制範圍的完整權限 token 必須由 AETHER 保存。

### 全程 STOP 條件

1. 沒有任何穩定介面（CLI 被移除、改名或需 GUI 互動）且狀態只存在記憶體或 SQLite。
2. 需要讀取 `orca-runtime.json` 的 token 才能運作。
3. 為了維持相容必須追著 Orca 的每個發版修補（以一個月內被打壞兩次為準）。
4. (c) 單獨已達成目標，疊加層的使用者價值不足以支付維護成本。

## 8. 決策

**有條件可行。** 條件是：只做讀取；以現有的 transcript / hook / git 路徑為主（它已經涵蓋由 Orca 啟動的本機 agent）；Orca 的名稱與脈絡只經由其文件化的 `orca` CLI 以容錯方式取得，並且在 Orca 不存在或版本不符時完整降級；不讀 Orca 的 SQLite 與 `orca-runtime.json`，`last-status.json` 不列入計畫。預計 Phase 0 到 2 合計約 7–9 個工作天。

**需要維護者決定或驗證：**

1. 在裝有 Orca 的機器上完成 Phase 0 的三個實測（CLI 輸出與成本、環境變數繼承、雙 `PermissionRequest` hook 行為）。
2. 是否要支援遠端 SSH / WSL 的 Orca agent（只有 CLI 路徑能看到，且缺 transcript，說話泡泡與 KPI 不完整）。
3. 產品上疊加層的價值是否大於維護成本，因為方案 (c) 單獨已讓 Orca 啟動的本機 agent 出現在辦公室。
