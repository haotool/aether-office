# Final verification

Generated from `docs/FEATURES.json` (docs/FEATURES.json). Do not edit by hand: run `pnpm verification:report`.

Features: **145**. Implementation: 112 implemented, 33 partial, 0 not started.

| Verification | Count | Meaning |
|---|---|---|
| passed | 84 | Verified by the listed tests at the scope stated in the ledger. |
| partial | 58 | Some behaviour is verified; the blockers column names what is not. |
| blocked | 3 | Cannot be verified in this environment (for example, it needs paid or authenticated provider sessions). |
| failed | 0 | A check ran and failed. |
| not_run | 0 | No check has been run. |
| not_applicable | 0 | Does not apply to this product. |

A passing build or test run is not a claim of production readiness. This file lists what the ledger can support, and what it cannot.

## passed (84)

| ID | Implementation | Requirement | Blockers |
|---|---|---|---|
| ENV-01 | implemented | 記錄 OS、architecture、Node／pnpm／git／provider binary 的實際版本。 | Provider binary versions are read from the CLIs on PATH; Windows and Linux hosts were not run |
| ENV-02 | implemented | 依賴有 registry metadata、peer／engine 相容查證與例外紀錄。 | The registry audit itself is run by hand and writes local evidence; the policy test enforces exact pins and no stale exceptions in CI |
| ENV-03 | implemented | 乾淨目錄可以 frozen-lockfile 安裝，不依賴開發者 global packages。 | Verified from a fresh clone on macOS arm64 with a warm pnpm store; a cold-cache or other-OS install was not run |
| ENV-04 | implemented | setup／migration／seed 重跑不破壞既有資料或重複 demo。 | — |
| ENV-05 | implemented | build、typecheck、lint 在同一鎖定環境成功。 | Run on macOS arm64 with Node 24.21.0 and pnpm 12.8.1 only |
| ENV-06 | implemented | 既有 git dirty changes 不被覆寫／reset／刪除。 | Covered for managed workspaces and integration; the platform never operates on the user's main working tree |
| ENV-07 | implemented | doctor 能區分 missing CLI、auth required、native module failure、healthy。 | — |
| ENV-08 | implemented | README 命令在真正乾淨環境重現，無未宣告步驟。 | Install, build, run setup --demo and the built control were reproduced from a fresh clone; found and fixed that pnpm's built-in setup and doctor shadow the scripts. The pnpm demo watcher is not part of the script |
| ARC-01 | implemented | web／scene 無 Node filesystem、PTY、provider SDK 私有依賴。 | — |
| ARC-02 | implemented | kernel 與 React／Three／Fastify／DB driver 的邊界由自動檢查保護。 | — |
| ARC-05 | implemented | 不支援的 provider capability 回明確錯誤並禁用 UI 操作。 | Only the resume gate is enforced per command today; other flags are informational until their operations exist |
| ARC-06 | implemented | 重要狀態只經 domain command 與政策 transition 修改。 | Guard covers work_items.state only; other aggregates rely on service-level checks |
| ARC-07 | implemented | DEMO／LIVE／OBSERVE／REPLAY 全程有可辨識來源。 | Replay is a read-only event list up to a chosen seq; it does not rebuild historical entity snapshots |
| ARC-08 | implemented | 進度與完成度不來自隨機資料或虛構百分比。 | Lint bans Math.random and shows no percentage; it cannot prove every future display is state-derived |
| CLA-06 | implemented | 忙碌時的訊息投遞遵守已驗證的 injection capability。 | No adapter supports mid-turn or turn-boundary injection (capability none): messages stay in the durable inbox |
| CDX-01 | implemented | schema 從對應 binary／官方版本生成並有版本紀錄。 | — |
| CDX-02 | implemented | initialize／initialized 與 request correlation 正確。 | 未授權 live 模型：以腳本化 app-server 驗證協定行為，真實 Codex 回合未跑 |
| CDX-04 | implemented | item／tool／message streaming 去重且能容忍延遲。 | 未授權 live 模型：以腳本化 app-server 驗證協定行為，真實 Codex 回合未跑 |
| CDX-05 | implemented | interrupt 對正確 active turn 執行，無誤殺另一工作。 | 未授權 live 模型：以腳本化 app-server 驗證協定行為，真實 Codex 回合未跑 |
| CDX-07 | implemented | approval 回覆對應正確 request、session 與參數。 | 未授權 live 模型：以腳本化 app-server 驗證協定行為，真實 Codex 回合未跑 |
| EVT-01 | implemented | state＋event＋outbox 在同一 transaction 提交。 | — |
| EVT-02 | implemented | 同 command idempotency key 不產生重複結果。 | — |
| EVT-03 | implemented | duplicate provider event 不重複改 projection／usage。 | 僅 synthetic/本機測試，非 live 模型。 |
| EVT-04 | implemented | snapshot 與 stream cursor 之間不漏事件。 | Single-process verification: better-sqlite3 is synchronous, so a snapshot and a concurrent writer cannot interleave inside one process |
| EVT-05 | implemented | 過期 cursor 明確要求 resnapshot，不能靜默略過。 | — |
| EVT-06 | implemented | control restart 後與 runner reconciliation 不重複 spawn。 | — |
| EVT-07 | implemented | 副作用結果不明時進入 indeterminate，而非無條件重跑。 | A runner that died mid-run and a runner that is only partitioned look identical to control; both stay indeterminate until a human cancels |
| EVT-08 | implemented | backup／restore 以實際 DB 執行並驗證資料一致。 | cursor-secret and owner-token are outside the database and are not part of a backup |
| MSG-01 | implemented | DM／room／thread 有真實持久資料與 ACL。 | Rooms are not yet exposed as MCP tools; agents post to a room only through the platform API |
| MSG-02 | implemented | broadcast 為每個 recipient 保留獨立 delivery 狀態。 | — |
| MSG-03 | implemented | persisted／injected／acknowledged／responded 不混淆。 | injected is never reached because no adapter injects into a running turn |
| MSG-04 | implemented | 斷線／重試不產生重複訊息副作用與動畫。 | — |
| MSG-06 | implemented | busy Agent 只在允許的 injection boundary 收到內容。 | Same boundary as CLA-06: nothing is injected, so a busy agent only receives content when it reads its inbox |
| TSK-01 | implemented | 循環 DAG、跨 project 污染與遺失依賴被拒絕。 | — |
| TSK-02 | implemented | task claim／assignment 有 version 與 concurrency 保護。 | — |
| TSK-03 | implemented | scheduler 遵守能力、scope、公平性與並行數。 | — |
| TSK-06 | implemented | LLM 提交 done 不會跳過 review／verification。 | — |
| TSK-07 | implemented | 重試上限／停滯診斷／人類 escalation 有實際效果。 | Provider rate-limit evidence is reported as null: it is never inferred |
| TSK-08 | implemented | cancel propagation 不把取消中的結果錯標新成功工作。 | — |
| GIT-01 | implemented | writer 使用專屬 worktree，不直接改使用者 main 目錄。 | — |
| GIT-02 | implemented | 路徑空白／Unicode／非法 ref／symlink 都有測試。 | 僅在 macOS 驗證；Windows 路徑語意（大小寫、保留名稱）未測 |
| GIT-03 | implemented | file reservation 的 advisory 屬性與衝突清楚呈現。 | Advisory only: conflict check is conservative on directory scope; not yet enforced at scheduler or merge gates |
| GIT-04 | implemented | dirty worktree cleanup 不刪使用者未提交內容。 | — |
| GIT-05 | implemented | diff 支援 untracked／binary／large file 安全降級。 | 僅在 macOS 驗證；Windows 路徑語意（大小寫、保留名稱）未測 |
| GIT-07 | implemented | test evidence 綁 head SHA，base 漂移會重新驗證。 | — |
| SEC-01 | implemented | owner／operator／reviewer／viewer／agent 實際 server grants 生效。 | — |
| SEC-02 | implemented | 每個 query、WS subscription、MCP tool 做 scope 檢查。 | Every HTTP route is swept for authentication and cross-project access; the stream is SSE (no WebSocket exists) and is covered by the revocation test |
| SEC-03 | implemented | viewer／agent 不能透過 payload 假冒身份提升權限。 | — |
| SEC-05 | implemented | 錯誤 Origin／Host、未認證 WS／API 被拒絕。 | — |
| SEC-07 | implemented | logs／export／events／frontend bundle 不洩漏測試 secrets。 | Scans the database, events, logs and responses for known test secrets; the frontend bundle is not scanned because no secret is available at build time |
| SEC-08 | implemented | 外部指令／peer message 不能繞過權限與支出策略。 | Remote and scheduled requests only create unassigned work, so they cannot spend; a global spend budget does not exist |
| REM-02 | implemented | enrollment token 短效單次使用，不是永久全域 shell token。 | — |
| REM-03 | implemented | machine grants 限制 project／root／provider／concurrency。 | Locally enrolled machines (enroll()) keep an empty root list, meaning unrestricted |
| REM-04 | implemented | 撤銷身份立即阻止新命令與敏感 stream。 | — |
| REM-05 | implemented | local spool 重連後按序去重，不丟已承諾資料。 | The spool is a 8 MB JSON file; a longer outage fails closed with RUNNER_SPOOL_FULL rather than dropping events |
| REM-06 | implemented | 斷線時依 policy 停新派工，恢復不重複執行。 | While control is unreachable a runner cannot claim, so no new dispatch starts; an in-flight run keeps going and is reported when the link returns |
| STD-01 | implemented | MCP 工具實際呼叫 kernel，不是回固定成功文字。 | Workflow 啟動刻意不提供給 agent（僅人類可啟動）；未以真實 provider CLI 連接此 MCP server |
| STD-02 | implemented | MCP identity／resource／message scope 可測且隔離。 | Workflow 啟動刻意不提供給 agent（僅人類可啟動）；未以真實 provider CLI 連接此 MCP server |
| STD-04 | implemented | ACP wire／SDK／schema 版本分開記錄。 | — |
| STD-05 | implemented | A2A gateway 的 AgentCard 宣告能力有對應實作。 | The card declares no streaming or push because neither is implemented |
| STD-06 | implemented | A2A task／message／cancel／artifact 路徑有 contract test。 | Verified with the official @a2a-js/sdk client over real HTTP; no interop run against a third-party A2A server |
| STD-08 | implemented | 未完成的 bridge 不在 UI 被標記為可用整合。 | hcom and Agent Mail bridges are not built and appear nowhere in the UI |
| UIX-02 | implemented | Agent／Task／Message／Approval／Review 共用相同權威狀態。 | — |
| UIX-05 | implemented | language switch 覆蓋繁中／英文，無散落 placeholder 文案。 | Key parity, script purity and placeholder-free copy are unit-tested; the English UI is not browser-swept |
| UIX-06 | implemented | 桌面與手機無主要內容溢出／遮擋／無法點擊。 | Horizontal overflow is measured on every page at 1440 and 390 px in both themes; there is no pixel-level clipping or tap-target audit |
| UIX-07 | implemented | deep link／reload 保留合理選取與可恢復工作上下文。 | — |
| UIX-08 | implemented | 重要 approval／失敗／stale 不只靠顏色表達。 | Badges are checked for visible text; icon-only meaning elsewhere is covered only by axe |
| VIS-07 | implemented | 路徑不穿牆／桌，有 unreachable 狀態與測試。 | Unreachable surfaces as a notice; that notice was not browser-tested; Grid A* at 0.5 m resolution |
| CAM-02 | implemented | tour 可跳過／暫停／手動中斷，結束恢復選取。 | — |
| CAM-03 | implemented | editor move／rotate／assign／undo／redo 真正保存與還原。 | — |
| CAM-04 | implemented | layout import schema／物件上限／動線驗證拒絕不合法資料。 | — |
| CAM-05 | implemented | high／balanced／low 有可觀察的實際資源差異。 | Measured as pixel ratio and draw calls on one machine (Apple M4, headless Chrome) |
| CAM-06 | implemented | WebGL unavailable／context lost 有可用 2D fallback。 | Covers WebGL being unavailable at start; the context-lost handler is wired but not exercised |
| CAM-07 | implemented | scene 反覆進出不持續洩漏 geometry／texture／listener。 | Leak check compares live GPU geometry and texture counts across five mounts at one quality level |
| A11Y-02 | implemented | Dialog focus trap／Escape／return focus 正常。 | Native modal dialog: focus may pass to the browser's own UI, never to the page behind it |
| A11Y-03 | implemented | canvas 外有等價的 DOM 狀態與操作入口。 | — |
| A11Y-04 | implemented | reduced motion 可關閉 camera 飛行／粒子／閃爍。 | The product has no camera flights or particles; the preference is honoured by character animation and camera damping |
| A11Y-05 | implemented | dark／light 文本對比與狀態 icon 有測試。 | axe colour-contrast on every page in both themes; state icons are covered by axe only |
| A11Y-06 | implemented | drag 操作有鍵盤或選單替代。 | The layout editor uses form controls, so no operation depends on dragging |
| A11Y-07 | implemented | audio／browser notification 預設不擅自開啟。 | The product has no audio at all; only opt-in browser notifications exist |
| INT-03 | implemented | webhook／polling retry 不形成同步迴圈或重複任務。 | Webhooks need a reverse proxy that preserves the Host header; polling works without one |
| INT-05 | implemented | skills 匯入／檢視／啟用／停用不自動執行未知命令。 | Skills are reference text served via MCP skills_list; no mechanism executes skill content by design |
| INT-06 | implemented | schedule 依 timezone 觸發，重啟不重複派工。 | UI creates daily/weekly schedules only (the API also accepts one-off); A schedule only creates unassigned work; there is no scheduled auto-assignment by design |
| QA-08 | implemented | FINAL_VERIFICATION 明確區分 passed／failed／blocked／not_run。 | — |

## partial (58)

| ID | Implementation | Requirement | Blockers |
|---|---|---|---|
| ARC-03 | partial | 所有公開 command／event 有 schema 與版本。 | PTY/observe/ACP 等尚未完成的公開契約仍待實作。 |
| ARC-04 | partial | Agent identity、session、run、thread、turn、task ID 不混用。 | PTY/observe/ACP 等尚未完成的公開契約仍待實作。 |
| CLA-01 | partial | 實作並驗證安裝版本適用的 CLI／SDK 啟動參數。 | synthetic app-server 與 Claude normalizer 驗證；未授權 live 模型；resume/steer UI 授權流程待補。 |
| CLA-02 | partial | structured stream 的 partial／complete／error 正常解析。 | synthetic app-server 與 Claude normalizer 驗證；未授權 live 模型；resume/steer UI 授權流程待補。 |
| CLA-03 | implemented | session resume 綁定原 project 與對應 provider session。 | 合成Codex resume與UI已測；真Codex/Claude resume尚未實測。 |
| CLA-04 | implemented | hook 安裝／更新／移除保留既有使用者設定。 | Codex reported all 9 installed hooks as trusted and enabled through its own hooks/list, and the installed commands ran under a minimal environment, but no Codex session has fired them yet; Claude hooks are installed only for this repository (project scope); Codex payloads for spawned threads (session_id vs thread id) were not observed |
| CLA-05 | partial | 工具事件與 session／parent 的對應可驗證。 | synthetic app-server 與 Claude normalizer 驗證；未授權 live 模型；resume/steer UI 授權流程待補。 |
| CLA-07 | partial | permission／auth／rate-limit 問題不偽裝成正常工作。 | synthetic app-server 與 Claude normalizer 驗證；未授權 live 模型；resume/steer UI 授權流程待補。 |
| CDX-03 | implemented | thread／turn 的 start／resume 流程正確。 | 合成Codex resume與UI已測；真Codex/Claude resume尚未實測。 |
| CDX-06 | implemented | steer 僅在支援時開啟，接受不等於 semantic ack。 | steer 對所有 provider 皆未開放（messageInjection=none），僅驗證未開放時被拒；支援時的 semantic ack 待 live 驗證 |
| RUN-01 | partial | 關掉 browser 不會自動殺死受管理的工作。 | macOS真PTY與瀏覽器已測；Linux/WSL2未測、native Windows拒絕。截斷後有gap提示但沒有完整ANSI畫面序列化；unknown人工結案待實作。 |
| RUN-02 | partial | process journal／PID identity 可區分重啟與 PID reuse。 | macOS真PTY與瀏覽器已測；Linux/WSL2未測、native Windows拒絕。截斷後有gap提示但沒有完整ANSI畫面序列化；unknown人工結案待實作。 |
| RUN-03 | partial | UTF-8、ANSI、resize、exit code 與 bounded scrollback 正常。 | macOS真PTY與瀏覽器已測；Linux/WSL2未測、native Windows拒絕。截斷後有gap提示但沒有完整ANSI畫面序列化；unknown人工結案待實作。 |
| RUN-04 | partial | terminal read／write 分權限，同時只能有合法 takeover owner。 | macOS真PTY與瀏覽器已測；Linux/WSL2未測、native Windows拒絕。截斷後有gap提示但沒有完整ANSI畫面序列化；unknown人工結案待實作。 |
| RUN-05 | partial | existing session discovery 需要核准路徑且預設唯讀。 | 已核准fixture的讀取、持久上報、readonly UI及fault tests完成；實際provider檔案相容性未驗證，讀取上限與GUI授權仍有限制。 |
| RUN-06 | partial | partial line／rotation／未知 transcript schema 有安全處理。 | 已核准fixture的讀取、持久上報、readonly UI及fault tests完成；實際provider檔案相容性未驗證，讀取上限與GUI授權仍有限制。 |
| RUN-07 | partial | stale／offline／unknown 不被顯示成 idle／success。 | 已核准fixture的讀取、持久上報、readonly UI及fault tests完成；實際provider檔案相容性未驗證，讀取上限與GUI授權仍有限制。 |
| RUN-08 | partial | structured log session 不顯示不存在的可互動 PTY。 | macOS真PTY與瀏覽器已測；Linux/WSL2未測、native Windows拒絕。截斷後有gap提示但沒有完整ANSI畫面序列化；unknown人工結案待實作。 |
| MSG-05 | implemented | request／reply 有 correlation、timeout 與持久等待狀態。 | Verified with synthetic agents; a real provider answering a durable request is not run |
| MSG-07 | implemented | thread／spawn／context budget 能停止無限 Agent 對話。 | Thread round limit (32) and per-sender rate limit (60/min) stop ping-pong and a human can open a new thread; spawn depth does not apply because subagents are disabled, and there is no token-based conversation budget |
| TSK-04 | implemented | Claude→Codex review→fix→test 的 workflow 可完成。 | The template pins Claude engineer and Codex reviewer and the loop is exercised with synthetic providers; a real Claude to Codex run needs paid, authenticated sessions that are not authorised |
| TSK-05 | implemented | provider 對調與 frontend／backend 平行 workflow 可完成。 | Provider swap, the parallel frontend/backend DAG and the bounded meeting are enforced and tested at the control layer; parallel worktrees with a real integration review were not run with real providers |
| GIT-06 | implemented | review comment 綁 commit／hunk，更新後能辨識過期。 | Comment create/list verified at control level with seeded diff jobs; browser only checks the empty-hunk state, not a full comment round trip; Line anchors are stored but not re-mapped across heads |
| GIT-08 | implemented | merge conflict 停止交付，不自動覆蓋或無批准 push。 | Candidate branch is not re-verified automatically before delivery; No PR handoff; push is intentionally never performed; Only owner may integrate; base moves are reported, not auto-rebased |
| SEC-04 | partial | approval 綁 action hash、session、expiry 與真實 provider ack。 | 批准/撤銷回歸已跑；完整 export/PTY/connector trust boundaries 與 live provider ack 待驗。 |
| SEC-06 | implemented | Markdown／URL／terminal clipboard／SSRF 有回歸測試。 | No Markdown renderer exists yet (all text is shown as text); A2A artifact fetching will reuse safe-fetch when built |
| REM-01 | implemented | 遠端 runner 以認證 outbound channel 連接 control。 | Control serves plain HTTP on loopback; TLS for remote use must be terminated by a reverse proxy, and no real TLS handshake was tested |
| REM-07 | implemented | 不同 machine 使用獨立 clone，不共享 SQLite／.git。 | Enforced as: runner state may not live inside an allowed repository; that each machine really uses its own clone is by construction (machine-bound workspaces) and not verified across two real hosts |
| REM-08 | implemented | 兩個獨立 runner process 的故障／恢復整合測試通過。 | Two real runner processes with the demo provider on one host: revocation, project scope, single-use enrollment and control outage covered; Not covered: SIGKILL of a runner mid-run, journal replay after a runner crash, native Git workspaces across two clones, and any real WAN, HA or Kubernetes setup |
| STD-03 | implemented | 通用 ACP adapter 真的協商能力、開始 session 並處理事件。 | A real prompt turn was not run against claude-agent-acp or codex-acp (needs paid, authenticated sessions); the real adapter was only negotiated; ACP agents cannot be used for read-only review and cannot resume by default |
| STD-07 | implemented | 第三方 token／artifact fetch 不繞過 audience／SSRF 邊界。 | The gateway never fetches remote artifact URLs at all (URL parts are refused); an outbound artifact fetcher would reuse safe-fetch and does not exist yet |
| UIX-01 | implemented | onboarding 從 Demo／Live 選擇到第一工作完整可走。 | Demo sign-in through to a first task is covered; live onboarding (execution policy, runner, provider sign-in) has no guided flow |
| UIX-03 | implemented | 所有主要操作按鈕可用或清楚說明不能使用的原因。 | Many disabled controls do not state why they are disabled |
| UIX-04 | implemented | 所有主要畫面具有 loading／empty／error／offline／no-permission。 | Loading, empty and offline states are covered; no-permission (viewer) states are not browser-tested |
| VIS-01 | partial | 辦公室是可旋轉／近看的真實 3D，非一張背景圖。 | 24 GLB rig/UV/PBR/14clips 與 checksum 通過；完整 campus/Earth/physical contacts/tour/performance/VRAM gate 尚未完成。 |
| VIS-02 | partial | 九個空間有辨識度、正確尺度與連續動線。 | 24 GLB rig/UV/PBR/14clips 與 checksum 通過；完整 campus/Earth/physical contacts/tour/performance/VRAM gate 尚未完成。 |
| VIS-03 | partial | 桌椅／螢幕／建築具有合理厚度、結構與必要細節。 | 24 GLB rig/UV/PBR/14clips 與 checksum 通過；完整 campus/Earth/physical contacts/tour/performance/VRAM gate 尚未完成。 |
| VIS-04 | partial | 角色有可維護 pivot／骨架與至少指定的主要 animation states。 | 24 GLB rig/UV/PBR/14clips 與 checksum 通過；完整 campus/Earth/physical contacts/tour/performance/VRAM gate 尚未完成。 |
| VIS-05 | partial | 動畫只映射真實狀態，不製造假的工作或訊息。 | 24 GLB rig/UV/PBR/14clips 與 checksum 通過；完整 campus/Earth/physical contacts/tour/performance/VRAM gate 尚未完成。 |
| VIS-06 | implemented | messageId 去重，動畫抵達不被當成真正 ACK。 | Dedupe and planning are unit-tested; the moving envelope was not exercised in a browser with an agent-to-agent message; Arrival is decoration and never changes delivery state |
| VIS-08 | partial | 原創資產／外部依賴都有清楚來源與授權。 | 24 GLB rig/UV/PBR/14clips 與 checksum 通過；完整 campus/Earth/physical contacts/tour/performance/VRAM gate 尚未完成。 |
| CAM-01 | partial | overview／desk focus／follow／reset 正常且不鑽模。 | 24 GLB rig/UV/PBR/14clips 與 checksum 通過；完整 campus/Earth/physical contacts/tour/performance/VRAM gate 尚未完成。 |
| CAM-08 | implemented | 效能報告來自實機量測，未達目標不寫成達標。 | One measurement: headless Chrome on Apple M4 (Metal), 904x548 viewport, vsync-capped near 60 fps, so headroom is unknown; No low-end GPU, mobile or other-browser measurement |
| A11Y-01 | implemented | 核心派工／訊息／approval／review 可只用鍵盤完成。 | Task creation is verified by keyboard alone; messaging, approval and review flows are not |
| A11Y-08 | implemented | axe／瀏覽器人工檢視的問題有 evidence 與修正。 | axe sweeps run on every page (and found and fixed unfocusable scroll regions); there has been no screen-reader pass |
| INT-01 | implemented | GitHub Issue→WorkItem→受批准的結果／PR 流程有實作。 | Live GitHub verification blocked: no credentials; behavior is checked against a local fake that follows the documented REST shapes; Pull request creation is not implemented (it needs a pushed branch, and push is never automatic); Result write-back is an owner-only API call with no UI button yet |
| INT-02 | implemented | Linear 匯入／狀態同步有實作、衝突規則與測試。 | Live Linear verification blocked: no credentials; GraphQL shapes and the RATELIMITED error code come from public docs and are untested against the real service; Import and comment only: Linear issue state is not written back |
| INT-04 | partial | knowledge 有 provenance、version、ACL 與繁中搜尋。 | Provenance/version/ACL/繁中搜尋/人類批准與駁回已實作及測試；內容修訂、撤回、大庫索引與測試證實分類仍未完成。 |
| INT-07 | partial | budget 遵守並行／turn／時間限制，未知成本不顯示零。 | 已有用量去重、回合/時間/並行限制與知識提案；pricing、全域預算與知識批准/version 操作待補。 |
| INT-08 | partial | usage 累積值／delta／resume 重播不重複統計。 | 已有用量去重、回合/時間/並行限制與知識提案；pricing、全域預算與知識批准/version 操作待補。 |
| QA-01 | partial | unit／contract／integration／E2E 都有真正執行紀錄。 | 完整產品尚未完成；不能把局部測試當最終 gate。 |
| QA-02 | implemented | fault injection 覆蓋 commit／delivery／ack 關鍵 crash window。 | Control-side commit, outbox, delivery and ack windows are injected and proven atomic; runner journal crash windows and the outbox dispatcher lease are not injected |
| QA-03 | partial | LIVE／DEMO／synthetic／captured 的證據不混淆。 | 完整產品尚未完成；不能把局部測試當最終 gate。 |
| QA-04 | partial | 真實頁面截圖覆蓋 overview／desk／review／approval／mobile。 | 完整產品尚未完成；不能把局部測試當最終 gate。 |
| QA-05 | partial | 每個需求的 code path／test ID／evidence 可查驗。 | 完整產品尚未完成；不能把局部測試當最終 gate。 |
| QA-06 | partial | 所有文件與命令對照最新程式，沒有假 endpoint／假腳本。 | 完整產品尚未完成；不能把局部測試當最終 gate。 |
| QA-07 | implemented | 最終重新 clean install／build／start／smoke 驗證成功或列具體失敗。 | verify:clean --e2e passed all 11 steps on 06a0a0e in a fresh clone (install, typecheck, lint, format, build, 236 tests, report, demo setup, built control smoke, browser tests); macOS only, no real provider smoke; re-run if HEAD changes |
| OBS-LOCAL-01 | implemented | 自動載入本機 Claude／Codex session；以 Git common dir 歸屬 worktree，以 hook 事件歸屬子代理；observe-only 3D 顯示。 | Activity is a file-mtime heuristic until hooks are trusted and fire; without a running process it is shown idle; Process-to-session matching is by --resume id, else by provider and directory in recency order; a Claude session that changed directory shows no process; Sessions in no git repository and outside a project scratch directory (for example a Codex Desktop thread in a plugin workspace) cannot be attributed and are not shown; Spawned Codex subagents are shown only while their rollout changed in the last 2 minutes; Hooks are proven only for this repository session so far; Only the 60 most recent sessions are scanned |

## blocked (3)

| ID | Implementation | Requirement | Blockers |
|---|---|---|---|
| CLA-08 | partial | 真實 Claude smoke 有 evidence，或精確標記 live blocked。 | 沒有真實付費模型呼叫授權；不執行 live smoke。 |
| CDX-08 | partial | 真實 Codex smoke 有 evidence，或精確標記 live blocked。 | 沒有真實付費模型呼叫授權；不執行 live smoke。 |
| MSG-08 | partial | nonce exchange 驗證跨 provider 真正取得並回覆訊息。 | A real Claude↔Codex nonce exchange needs two paid provider sessions, which are not authorized; only a synthetic nonce reply is covered |
