# AETHER OFFICE 進度

## 2026-10-01 05:34 — 驗證器安全與超時回歸

- 自行追查發現驗證器繼承完整 runner 環境；新增真子程序測試先重現失敗，再改成必要變數白名單。`evidence/verifier-env-before.log` 保留失敗證據；不宣稱這是 OS sandbox。
- 新增「主程序已退出、子孫程序忽略 SIGTERM 且持有 stdout」測試，修復過早依主程序 exitCode 跳過程序群組終止的漏洞。`evidence/verifier-descendant-before.log` 保留修復前失敗；POSIX 路徑實測，Windows 測試明確 skip。
- 全套 29 tests passed（5.81s），`evidence/tests-verifier-hardening.log`；production build/typecheck passed，`evidence/build-verifier-hardening.log`。未改 UI，未重跑瀏覽器；常駐 demo runner 尚未重啟載入本次修正。
- 下一步仍為 retry/resume/fix loop 與主規格其餘範圍。發現 `work.assign` 只允許 ready → assigned，failed/changes_requested 尚無回到 ready 的命令；不能只放寬狀態而從 repository HEAD 重新建 worktree，否則會漏掉先前成果。需綁定原 machine/workspace、保留修改、清除失效審查並防止舊 run 結果覆寫。沒有派子代理或呼叫付費模型。

## 目前授權與身份（2026-10-01）

最新指示已改為「零信任、从零 clone 開源底座、獨立完成產品」。舊 0.3.0 ZIP 缺少不再是阻擋；不宣稱繼承其歷史驗證。

- 工作分支：`aether/product`，上游起點 `665aeec571bc03f76cbd16de8d628dd169a48874`。
- 上游來源：AgentSystemLabs/agent-office；MIT notices 保留。
- 沒有派子代理，沒有付費模型呼叫、remote 寫入或全域工具修改。
- 專案工具鏈：`.tools/node-v24.21.0-darwin-arm64/bin/node`；官方校驗碼 `evidence/node-runtime.json`。
- pnpm 已升級專案 packageManager 至 registry stable 12.8.1；安裝結果查看 `evidence/workspace-install-third.log`。

## 已產出與實測

- 七個參考 repo clone 在 `.research/`，來源紀錄 `docs/research/SOURCES.json`。MCP Agent Mail 的額外 license rider 已查明，不納入 runtime 或程式重用。
- 上游 typecheck passed；系統 Node 首輪 tests 436 pass / 1 process fail（OpenSSL 動態庫錯誤），換隔離 Node 24.21.0 原樣重跑 444/444 passed。logs 保留。
- 新 pnpm workspace、精確依賴、版本化 Zod contracts、純 domain policies。
- SQLite WAL/FULL、migration checksum、transaction + outbox + command journal、持久訊息與 keyset paging、scope/cookie/CSRF/revoke、runner leases。
- `evidence/foundation-tests.log`：16 tests passed，範圍 domain/SQLite/Fastify inject；不是 browser 或真模型證據。
- Runner 真 fixture child process 與本地 journal 已實作，但整個獨立程序旅程尚待測。
- React 2D pages 與 R3F 九區程序化場景、上游改編幾何 helper 已寫入；建置／browser 尚待跑完。

## 精確下一步

1. 檢查第三次 workspace install（exec session 23654）；若仍在跑，poll 該 handle，不重開。
2. 使用隔離 Node 的 PATH 跑 `./node_modules/.bin/tsc --noEmit`、`./node_modules/.bin/vitest run`、`node scripts/build.mjs`，修復失敗。
3. `PATH="$PWD/.tools/node-v24.21.0-darwin-arm64/bin:$PATH" node --import tsx scripts/dev.ts --demo` 啟動三程序。此時尚無開啟中的 dev server。
4. 真 browser 登入（從 `.data/demo/owner-token` 讀值但不輸出），檢查 desktop/mobile、console、3D 截圖、UI 派工／發訊息／layout 保存。
5. 接 Git/verification 與 native providers，同時建立 Blender 資產流水線。

未完成：主規格大部分承諾，尤其 live providers、批准完整往返、真 Blender 動物、replay、remote/ext、發行 gates。Goal 保持 active，不宣稱產品級已達成。

## 新增檢查點（2026-10-01）

完整續作狀態與 live process handles 見 `docs/CHECKPOINT.md`。瀏覽器第五輪桌面/手機2項E2E與axe通過；後續已新增 native adapter / migrations / actual GLB runtime，需重跑其整合驗證。Blender曾完整產出八家族，但加強檢查後 CAT LOD2 發現退化面，當前 manifest/source 不一致必須修復，不可交付為已驗證資產。Native只跑synthetic process和normalizer，未使用真模型。

## 2026-10-01 04:54 — 實際資產與 native transport 整合

- CAT LOD2 已定位為 Blender collapse 產生的 6 個重複面。生成器僅允許移除完全相同頂點集合的重複面，其他 geometry repair 仍 fail；八家族重新生成，24 個 GLB 的二進位、skin weights、UV/PBR、14 clips、來源/貼圖 checksum 驗證通過（`evidence/assets-validation.json`）。
- `evidence/renders/fox-3840x2160.png` 是 Cycles CPU、48 samples、原生 3840×2160；112.65 秒，metadata 含 source/output SHA。已人工看圖；目前造型仍偏簡單玩偶，尚非完整 campus art gate。
- 新 Approval API/UI：hash/session/lease/expiry/version 綁定、拒绝已撤銷決策者／machine、decided/sent/實際工具事件分開。HTTP 回歸涵蓋過期、tamper、錯誤 lease/session、異機、重複決策與身份撤銷。
- Native runner 接上本機 config 的 provider/repository grants、Git worktree、provider events、permission poll 與 journal；專案 owner 明確啟用 policy 後才可派 live 工作，停用會取消排隊或要求執行中取消。沒有在本機建立啟用 config，也未呼叫模型。
- `tests/aether/native-runner.test.ts` 使用標明 synthetic 的真 subprocess app-server、真 HTTP、真 Git、真 SQLite 測整條批准/工具/usage 路徑；不是 live Codex 證據。首輪測試揭露停止時未等 journal ACK 的 race，新增 shutdown drain 後第二輪通過。
- 全部 25 tests 通過：`evidence/native-integrated-all-tests.log`。GLB 版 browser desktop/mobile 兩項 E2E/axe 通過：`evidence/e2e-glb-run.log`。後續 native runner 與 settings 修改尚需重新 production build/start/E2E。
- 待處理：native bundled SDK runtime dependency install/build 驗證、MCP、PTY、observe、review/test/merge 完整 workflow、connector/remote/ACP/A2A、場景美術/音樂/效能與其餘主規格。不可宣稱產品已完成。

## 2026-10-01 05:27 — MCP、固定版本驗證與圖像載入缺陷

- MCP 已有 8 個真正呼叫控制台的工具與 session resource；run-scoped credential 在終止/取消/撤銷後失效。真 stdio/HTTP nonce reply、去重與 expiry 測試通過；正式 `dist/mcp.js` 也實際跑過（`evidence/mcp-built-stdio-test.log`）。
- 新增 machine-local verifier、持久 runner jobs、工作區差異 UI、審查後測試、匹配版本證據與人類接受。合成 native 全鏈 E2E 通過，包括 Approval/Workspace/Reviews；不是 paid/live provider 證據。
- 外部管理者測試器固定複製/hash；測試前後檢查 head/tree/index/base/source，保留 output hash 與私有 log。新增忽略 SIGTERM 的 verifier 回歸，1 秒後終止自有 process group，UTF-8 分段輸出不破壞（`evidence/verifier-timeout-test.log`）。
- 軌道場景新增原創程序化地球/星景、底部服務結構、休息區茶水台；修復透明隔間被實心平板遮住與後牆玻璃超出基地。
- 近景發現白模。先前只檢查 GLB 紋理綁定不足；進一步 SHA 比對證明 GLB 內嵌圖與原圖相同，真因是 CSP `connect-src` 未允許本機 `blob:` fetch，GLTFLoader 靜默丟掉 textures。已新增此必要資源規則及載入時 PBR guard，缺圖會進 2D fallback 而不是白模。瀏覽器 console errors 現在列入 E2E；唯一豁免是登入前 `/api/session` 的預期 401。
- 修復後近景 `evidence/screenshots/e2e-desk-closeup.png` 已人工確認有顏色。更早的截圖有白模，不能當成完整材質證據。`evidence/e2e-csp-texture-fix.log` 首輪失敗只因測試把登入前預期401列為錯誤，已窄化處理並重跑。
- 最後重跑：`evidence/e2e-texture-guard-final.log`、`evidence/tests-workflow-texture-final.log`；執行中狀態見 CHECKPOINT，未讀到退出結果前不標 passed。
- `docs/FEATURES.json` 已對有實際 code/test/evidence 的項目更新，完整 scope 仍保留。PTY、observe、resume/retry/fix loop、ACP/A2A/connectors、排程/預算/skills、全場景 Blender 和 audio/performance/full release gates 都尚未完成。

最終本輪結果已讀取：27 tests passed（7.12s）、3 browser E2Es passed（24.3s）、production build/typecheck passed、dependency boundaries passed。證據為上述 final logs 與 `evidence/boundaries-workflow-final.log`；完整產品仍未完成。

## 2026-10-01 05:39 — 保留工作區的 retry/fix 流程

- work.retry 命令、owner/operator 權限與任務 UI 已接通。failed／changes_requested 才可重試；三次總上限、冪等、version、前 run terminal、workspace job 與機器撤銷檢查生效。新 session 和批准，原機器獨占領取；保留原 worktree 的 commit 及 dirty WIP。
- 原生合成整合測試新增退回修改→重試→重新批准→驗證→接受，檢查原檔案保留、另一台 machine 無法 claim、工作區仍只有一份。新增 control 回歸證明三次上限、agent 不可自我重試、舊 run 結果被拒絕。
- 全套30 tests passed（6.38s）：evidence/tests-retry.log；build/typecheck passed：evidence/build-retry.log；3 browser E2Es passed（24.5s）：evidence/e2e-retry.log。瀏覽器使用 synthetic binary，沒有付費呼叫；啟動初期 runner fetch failed 後恢復，所有流程最後通過。
- 待續：provider session resume、人工 escalation、跨 provider 修正、PTY/observe、DAG/排程/connector/美術等主規格；review/workspace UI 的舊 job 證據需要清楚標記版本（server 已以 version/head 擋舊驗證）。常駐demo程序未重啟載入本輪，E2E啟動的是最新built artifact。

## 2026-10-01 05:42 — 原生 session resume 與跨 run 用量去重

- work.retry 新增明確 resume 選項，UI checkbox 接通。server 從前次 terminal run 取得 providerSessionId，只允許 live Codex/Claude、同 agent/provider 與既有 workspace/machine；started 回報不符原 session 時拒絕。NativeExecutor 傳入既有 adapter resume options；未啟動真 provider。
- migration006 新增 session_usage 高水位並从舊 usage_totals 建立 baseline；同 provider session/turn 的重播不重複計費，新增加的 token 才記入本 run。Claude 真實 resume usage 語義未驗證，不宣稱帳務認證。
- tests-resume-final.log 首次失敗是測試編輯把第一次10/5預期誤改成resume後14/8，已修正。tests-resume-corrected.log 全30項通過6.23s，涵蓋合成 thread/resume、工作區保留、重播與累計增加、demo resume 拒絕。e2e-resume.log 全3項通過21.8s，實際checkbox/重新批准/成果驗證；build-resume.log production+typecheck通過，dependency boundaries通過。
- 下一步：人工 escalation、舊job證據版本標示、PTY/observe、剩餘主規格。現有demo常駐程序尚未套用migration006/新版build；測試服務使用最新built版本。沒有派子代理、付費呼叫或remote寫入。

## 2026-10-01 05:45 — Owner 單次追加重試額度

- migration007 增加 maxAttempts，預設3、絕對上限100。work.extend 僅owner能執行，必須failed/changes_requested且額度耗盡，原因必填；增加一次、版本遞增，次數不歸零。批准不排程，須另行重試；未使用額度不能重複增加。事件保存原因與批准者。
- 任務UI顯示動態上限、上限提示與owner原因表單。實際瀏覽器跑到第3次被擋，再批准第4次、重新批准工具、審查、測試、接受。
- evidence/tests-escalation.log：30 tests passed7.95s；evidence/build-escalation.log：production/typecheck passed；evidence/e2e-escalation.log：3 passed34.8s。全為synthetic provider；無子代理、無付費模型。
- 待完成仍包括停滯診斷、跨provider委派、PTY/observe、歷史證據UI版本標記，以及完整規格其他功能、美術和發行gate。現有常駐demo仍舊版本；E2E已用新build。

## 2026-10-01 05:47 — 歷史驗證證據版本標記

- workspace API 現在傳回 runner job 的 expectedHead/expectedVersion。Workspace/Reviews 共用版本標記，舊diff/驗證在重試或版本變更後標示「歷史證據，不代表目前版本」。驗證通過造成的一次version遞增依state/verifiedSha辨識，不誤判成歷史。
- evidence/build-evidence-label.log production/typecheck passed；evidence/e2e-evidence-label.log 三項E2E passed28.0s。新增真瀏覽器斷言：初次diff對應版本、重試後歷史diff、新驗證仍對應目前版本。未重跑與此變更無關的unit suite；上一輪30項通過仍為上一輪證據。
- 下一步停滯診斷需區分machine heartbeat和run progress，permission/peer wait、無新事件但machine存活、offline與unknown，不可自動kill/restart。仍有大量主規格功能與美術待完成。

## 2026-10-01 05:51 — 唯讀工作診斷

- 新增diagnoseWork服務、專案scope API與任務詳情UI，分離machine heartbeat和run last event。辨識permission/peer wait、approval expiry/ack等待、queued/claimed、offline/revoked、60秒无新事件、indeterminate。沒有provider rate-limit證據時不推測，仍屬未接入項目。
- 首輪tests-diagnostics.log失敗揭露事件查詢錯用causationId；實際run關聯在correlationId。修復後tests-diagnostics-fixed.log31 tests passed6.58s，涵蓋心跳不更新工作進度、peer wait被新assistant事件解除、批准各狀態、scope拒絕與診斷不修改run/events。
- e2e-diagnostics.log3 passed37.5s（修正peer correlation欄位前的build；browser新增等待批准診斷未受該錯誤影響）。修正後build-diagnostics-fixed.log production/typecheck passed。未把E2E當作peer-wait路徑證據，該路徑由上述真SQLite回歸驗證。
- 剩餘：provider rate-limit normalization、PTY/observe、DAG/skills/knowledge/schedules/connectors、完整美術與release gates。

## 2026-10-01 05:56 — 真 PTY runner 元件

- apps/runner/src/pty.ts 使用已安裝node-pty1.1.0，真TTY、UTF8/ANSI、resize、有限byte/chunk緩衝、cursor/gap、30秒排他接管lease、退出碼、TERM→KILL超時。只接受固定profile的binary/args/cwd；環境不帶runner/API秘密。複用processIdentity，簽名縮為只需要pid。native Windows明確拒絕；macOS實測，Linux/WSL2未測。
- pty-first.log先失敗posix_spawnp：已安裝macOS spawn-helper缺執行位元。新增scripts/prepare-pty.mjs及專案postinstall，只對專案檔案copy→chmod→rename，避免改pnpm共用hardlink。pty-helper-fixed.log兩項真PTY回歸通過；tests-pty-foundation.log全33項通過7.99s；build-pty-foundation.log build/typecheck通過。
- 本輪是可執行的runner primitive，尚未由Runner tick引用，尚無canonical terminal session/commands、project RBAC入口、持久spool/restart reconciliation或xterm browser UI；不可宣稱PTY功能已交付。下一輪將接線，不能以此元件代替完整規格。
- 官方依據：https://github.com/microsoft/node-pty ，並讀取安裝版typings/node-pty.d.ts、lib/unixTerminal.js和scripts/post-install.js；上游src/server/screen.ts提供xterm snapshot模式參考，未複製其程式碼。

## 2026-10-01 06:03 — Canonical terminal commands / RBAC

- migration008建立terminal_sessions/terminal_commands及machine terminalProfiles；新增start/takeover/release/input/resize/stop命令，live policy與本機profile root/hash授權、owner/operator寫入、project read、30秒lease epoch、4個session上限、128個pending command上限。排隊stop直接取消start，不先開程序。
- runner claim只派一次；30秒未確認或機器離線後進indeterminate，不自動重送input。late running snapshot不復活unknown/stopping，snapshot大小/seq有界。輸入正文不進event/receipt；執行結果回報後清除private command payload。profile列表只回目前project root。
- tests-terminal-control.log34 tests passed8.94s；terminal-control-final.log與terminal-control-scope.log針對最後停止中容量和profile隔離調整通過；最後tsc通過。build-terminal-control.log建置通過，但早於最後兩個小service調整。無browser修改，未跑E2E。
- PTY仍未全鏈：下一步NativeExecutor本機profile、Runner terminal命令消費／journal／snapshot、重啟unknown，最後xterm read-only/takeover UI。canonical測試的snapshot明確是synthetic，不冒充真PTY relay。

## 2026-10-01 06:19 — PTY runner／HTTP／xterm 全鏈

- Native config 新增固定 terminal profiles；runner heartbeat 發布 root/hash。TerminalRunner 在執行前写 journal、回報命令結果與有限 snapshot；重啟將未確認輸入與原live快照標為indeterminate，不重送或採用舊PID。policy停用/runner撤銷停止記憶體持有的程序。UI新增lazy xterm6.0.0終端機頁，預設唯讀、明確接管、resize、輸入、重新載入讀回、停止/退出碼/最近命令狀態；OSC52禁用。
- 真HTTP/PTY測試先揭露退出回報race（terminal-wire-{first,debug}.log）：HTTP期間退出的process被過早從map移除，導致沒有最後snapshot。修復為退出快照ACK後才刪除；terminal-wire-fixed.log與terminal-wire-recovery.log通過。重啟測試證明DO_NOT_REPLAY輸入不重送。
- 新PTY程序群組測試：父程序被TERM結束、子程序忽略TERM時，仍由1秒後群組KILL收束，terminal-group-stop.log通過。native Windows拒絕，Linux/WSL2未測。
- 途中完整回歸另發現固定4329測試port競爭，改測試專用ephemeral port；Modal自動焦點誤落透明file input，改排除file/hidden/disabled；diagnostics回到任務時仍用派工前cache，改version query key及立即refetch。保留tests-terminal-final.log/e2e-terminal-final.log/e2e-terminal-release-candidate.log失敗證據。
- 最終unit/integration：tests-terminal-release-candidate.log36 passed9.22s。最終production/typecheck：build-terminal-diagnostics-final.log passed。最終browser：e2e-terminal-diagnostics-final.log3 passed37.5s，含真PTY頁完整旅程和既有desktop/mobile。dependency boundary passed；git diff --check無錯。最後兩個diagnostics/UI焦點修正由browser涵蓋，未再無故重跑相同unit。
- 依賴安裝/授權：install-xterm.log、docs/DEPENDENCY_AUDIT.md、THIRD_PARTY_NOTICES.md。本輪PTY可從browser操作，但8KiB scrollback截斷後只提供gap提示，不是完整ANSI狀態還原；結果不明人工結案與跨平台仍待完成。外部observe、ACP、DAG、完整knowledge/skills/schedules/connectors、全美術/audio/performance/release等完整目標仍未完成。沒有付費模型、子代理或remote寫入。

## 2026-10-01 06:35 — 外部觀察讀取器

- 新observer.ts：明確核准root下的有限JSONL discovery、檔案開啟前後identity/path檢查、只讀與no-follow/nonblocking flags、Codex版本/cwd gate、完整UTF8行/游標/輪替/刪除/未知schema/資源上限處理。忽略analysis/reasoning與非可見channel，不跟隨父session，不將event_msg完成通知当成task完成。
- Claude重用安裝SDK的getSessionMessages+唯讀SessionStore，在核准檔案內重建parentUuid鏈，只輸出可見text、排除thinking；沒有啟動provider/model。測試只用臨時fixture，未讀使用者private transcript。
- observer-first.log首輪是測試import把realpathSync從node:path匯入而失敗，修正後observer-second.log通過；observer-sdk.log涵蓋真SDK讀取；tests-observer-readers.log全39 tests passed6.90s；build-observer-readers.log build/typecheck通過。最後分開limit_exceeded與unsupported_schema的調整由observer-limits-final.log及tsc確認。無UI改動、未重跑E2E。
- 自動核准曾拒絕含rm -f的綜合命令，未執行；改用apply_patch新增程式，空白/tmp/aether-observer-placeholder保留，不影響功能。
- 仍待接canonical observed-only資料、runner opt-in、checkpoint/outbox原子性與UI。Claude檔案2MiB上限、Codex單行64KiB上限、實際private格式相容性尚未驗證。完整版目標保持未完成。

## 2026-10-01 06:40 — Canonical OBSERVE 上報與歷史

- migration009建立observation_sources/records/reports。新上報schema/API只允許具專案範圍且未撤銷的runner，目標必須provider=observe/mode=observe；不能寫入managed agent或工作狀態。
- reportId綁定request hash及machine；source revision連續遞增，record source ID去重且內容衝突拒絕。資料與observed來源event同一transaction；共用redact遮罩敏感字串。Observe agent初始activity=unknown，不冒充idle。
- 讀取API含stale/offline判斷与keyset history paging；實測105筆跨100筆頁界沒有漏失。觀察文字自稱task completed也不改work；observe agent仍不可派工。
- evidence/tests-observation-control.log全40 tests passed6.80s；build-observation-control.log production/typecheck passed；dependency boundaries與diff check通過。沒有UI改動，未跑browser；這是資料面測試，不是reader→HTTP全鏈證據。
- 下一步明確本機opt-in observer profiles、reader checkpoint與pending batch同一journal原子保存、ACK去重、runner排程及OBSERVE UI。完整產品保持未完成。

## 2026-10-01 06:56 — OBSERVE reader／runner／控制台／UI 全鏈

- Native JSON observations opt-in profiles綁定project/observeagent/provider/canonical projectRoot/approvedRoot/relative files，選用bounded discovery；每次讀取檢查授權根路徑未被替換。控制台新增canonical root比對，拒絕錯配專案。
- ObserverRunner逐來源輪詢；游標、revision、去重cache與pending batch同一journal先存再送，save失敗回復記憶體游標；ACK遺失使用相同reportId。按JSON UTF8 bytes分批，避免長中文記錄造成413。配置移除後不再讀取或傳送不在目前授權來源集合的pending。
- 觀察傳送改為Runner獨立非重疊promise，停止時停止後續讀取、保留pending；觀察403不終止其他已授權工作，身份401仍fail-closed。真HTTP延遲上報測試證明普通tick不等觀察端回應。
- 外部觀察頁有OBSERVE唯讀標示、来源狀態、讀取/新增時間、歷史分頁，不含派工/批准/接管操作。evidence/screenshots/e2e-observe.png已人工看圖。E2E首輪fixture cwd使用macOS路徑alias而被嚴格canonical gate拒絕（e2e-observe-ui.log），已把fixture生成改為canonical path，未放寬驗證。
- 最終tests-observe-nonblocking.log42 tests passed6.91s（Codex/Claude真HTTP、長中文batch、commit後ACK遺失、磁碟save失敗、非阻塞）；build-observe-final.log production/typecheck passed；e2e-observe-final.log3 passed37.3s，含顯示觀察及刪檔狀態，並重跑既有PTY/派工/desktop/mobile。沒有付費模型或使用者私有對話檔案讀取。
- 仍未完成：實際provider檔案compatibility、GUI本機授權設定與大檔案策略、ACP/A2A/connectors、Task DAG/knowledge/skills/schedules、完整美術/audio/performance/release等主規格。Goal仍active。

## 2026-10-01 07:09 — 知識提案與人類審核

- migration010新增updatedAt、reviewedBy/reviewReason及work/artifact/commit引用。knowledge.propose要求非空來源，工作/產物必須同專案；commit只作未驗證引用。MCP提案自動帶入當次workId。
- knowledge.approve僅owner可決策approve/reject，expectedVersion和proposed狀態檢查、同命令冪等、作者/來源/理由/更新版本與原子event保留。human_approved不冒充test_verified，沒有自動執行內容的路徑。
- UI顯示來源與作者、引用、owner審核表單、人類批准/駁回標示；evidence/screenshots/e2e-knowledge-review.png已看圖。43 tests passed7.81s（tests-knowledge-review.log）、production/typecheck passed（build-knowledge-review.log）、4 browser E2Es passed37.1s（e2e-knowledge-review.log），含axe。
- 後續只增加繁中搜尋斷言及修正fixture繁體用字，knowledge-search-final.log針對性測試通過；e2e-knowledge-final.log針對性UI確認1 passed4.0s。docs/KNOWLEDGE.md載明限制：目前100筆搜尋上限，內容修訂/撤回、完整索引、測試證實分類仍未完成。
- 完整目標仍active；ACP/A2A/connectors、DAG/skills/schedules、全3D美術/audio/performance/release尚有大量工作。沒有子代理、付費模型或remote寫入。

## 2026-10-01 07:20 — Task DAG 檢視與受限依賴編輯

- 新work.dependencies命令只允許owner/operator修改未派工、attempt0的ready/backlog任務。驗證version、同專案依賴、duplicate/missing/cycle，原子重算readiness。已派工歷史不可改寫；create/edit事件帶dependencies資料。
- TaskDag lazy載入React Flow12.12.0；固定大小節點用Kahn拓撲分層，不加layout套件。支援縮放、fit、滑鼠與鍵盤開詳情；詳情有文字版依賴和可用的修改表單。圖形連線本身保持唯讀。
- tests-dag.log45 tests passed7.98s；build-dag-pointer-fix.log最終production/typecheck passed。首輪e2e-dag.log為DAG1 failed／其餘4 passed：ReactFlow關閉selection/drag後將node設為pointer-events:none。根因修復是接上onNodeClick，非force click；e2e-dag-pointer-fix.log專項1 passed5.7s，含cycle拒絕、滑鼠/鍵盤、依賴保存重載與axe。沒有宣稱最後重跑單一5/5全套。
- e2e-task-dag.png已看圖；依賴審核/第三方notice及docs/TASK_DAG.md已更新。完整workflow templates、公平排程、取消傳播仍待做；其餘完整主規格仍active，沒有子代理/付費模型/remote寫入。

## 2026-10-01 07:33 — 取消傳播、SSE shutdown 與常駐 demo 更新

- migration011新增cancelCause。取消根任務時以recursive CTE/UNION找出同專案未執行的backlog/ready/blocked後續，原子取消、各自version/event，菱形路徑只處理一次；保留已有attempt或active run的工作。UI說明影響範圍並顯示來源任務。
- tests-cancel-dag.log47項通過；e2e-cancel-dag.log5項通過39.3s，含取消原因、無關任務保留與既有各旅程。
- 常駐程序檢查發現舊control45997已停止監聽但仍因SSE連線持有demo DB。第一個shutdown測試誤用events JSON endpoint，不算SSE證據；修正為stream並檢查content-type後sse-shutdown-stream-before.log重現SSE_PREVENTED_SHUTDOWN。新增preClose關閉SSE集合，最終tests-cancel-shutdown-final.log48 passed6.78s，build-cancel-shutdown-final.log通過。
- 已核對45997/46026/62234命令、cwd、DB及socket屬本專案demo；DB無runs。對這三個明確PID送TERM後確認全退出，再啟動最新版demo control/runner。新handles control45065、runner13432；logs control-runtime-updated.log/runner-runtime-updated.log。demo-runtime-upgrade.json證明health ok/mode demo、migration1..11、SQLite integrity ok、升級前備份存在。沒有重置token或資料，沒有啟動live模型。
- 最新全browser e2e-cancel-shutdown-final.log已確認5 passed（39.6s），test-results/.last-run.json為passed。完整主規格仍未完成；訊息等待取消、indeterminate人工處理、workflow/skills/ACP/整合/美術/release等仍待續。

## 2026-10-01 07:38 — MCP 訊息等待期限與取消

- 實際 HTTP stall 重現：timeoutMs=100 的 wait_for_message 原先仍等 API 5 秒（mcp-wait-before.log）。等待現在以 AbortSignal.any 合併 MCP cancellation 和工具 deadline，傳給 fetch 及 delay；timeout 不再回 generic unavailable，回 timedOut；取消不會開始下一次 poll。權限失效仍回 CONTROL_HTTP_401，不冒充正常 timeout。
- tests/aether/mcp-wait.test.ts 以真 HTTP stalled response、SDK linked transport 測 deadline 與取消後 socket 關閉；tests/aether/mcp.test.ts 以真 stdio + control HTTP 測任務取消後正在等待的工具被拒絕。第一次修復測試因 JSON 雙層字串斷言寫錯失敗（mcp-wait-after.log），改解析 tool content，未放寬時間斷言。
- tests-mcp-wait-final.log 全50 passed6.50s；隨後增加 task-cancel 斷言，mcp-task-cancel.log 專項1 passed649ms；build-mcp-wait-final.log 建置/型別通過；git diff --check通過。此輪為自我審查，遵照不得派子代理。沒有UI修改，未重跑browser；未啟動付費provider。
- 完整範圍仍未完成：MSG-05 request/reply持久等待紀錄、timeout/reply correlation讀取與恢復仍缺少；目前這個修復只建立bounded MCP wait取消的證據。下一步實作持久request等待的同交易寫入、每收件者reply匹配、重啟恢復和cancel終止，再接入UI/MCP查詢。

## 2026-10-01 07:42 — 持久 request／reply 等待

- migration012建立message_waits，以messageId/recipientId為主鍵，保留project/work/run、deadline、replyId、endedAt與pending/responded/expired/cancelled。request與各收件者等待同命令交易保存，重送不重複。work/run綁定來自驗證身份，不能由payload偽造。
- 回覆只解決精確replyTo、原收件者、且送回原sender的等待；既有recipient delivery responded也修正相同destination檢查。deadline從TTL持久化；讀取或reply時對帳timeout/terminal run。work.cancel同交易對帳取消，晚到reply不復活等待。歷史request不回填不存在的綁定證據。
- 新HTTP GET messages/:id/waits及MCP get_request_status；getMessage ACL先驗證，agent僅看自己收到或自己發出的等待，owner可查專案。尚未接UI、主動timer及獨立wait transition事件；policy disable/runner terminal在下次讀/reply對帳，不能宣稱同步事件已完成。
- 首輪message-waits-first.log失敗因測試用demo run取live-only sessionCredential；改用控制台正式live policy+codex registration/claim建立合成session，沒有啟動provider模型。tests-message-waits-final.log51 passed6.52s，含檔案SQLite關閉重開、時間注入、兩收件者、錯誤reply目的地、ACL、真HTTP route、取消前直接DB核對、晚回覆、stdio MCP讀取。build-message-waits.log建置/typecheck通過；diffcheck通過。自我審查、沒有子代理。未改UI，未跑browser。
- 下一步：把typed wait資料與每收件者狀態接入訊息頁，補browser回覆/重載/可及性；之後持續完整workflow與美術等主規格。完整目標未完成。

## 2026-10-01 07:46 — 訊息等待畫面

- messageWaitSchema提供typed輸出驗證。Messages request卡片以原生details展開等待，只有展開時query/2秒刷新；顯示逐收件者狀態、期限與reply引用，歷史無等待資料明示，不憑空推斷。繁中/英文均補齊。
- e2e-message-waits.log首輪locator錯用exact訊息，但導航有未讀數「訊息 1」而timeout；改用有界optional數字名稱，e2e-message-waits-final.log1 passed6.1s。真HTTP建立合成self-request/reply，瀏覽器驗pending、reload、replyId、axe，非真provider證據。
- 已看e2e-message-waits.png；發現原有delivery available誤譯可派工，改成訊息專用待讀取／Awaiting read，人類收件者不再空白。最終build-message-labels-final.log與e2e-message-labels-final.log均passed；此前tests-message-waits-ui.log51 passed6.54s。本輪無完整6項browser重跑，僅相關專項。
- 自我審查，沒有子代理或付費模型。仍待主動期限/終止狀態事件與其餘workflow、skills、3D美術/audio/release主規格。

## 2026-10-01 07:49 — 等待紀錄主動對帳與原子事件

- 控制台onReady先對帳一次，再每秒處理最多200筆terminal等待，preClose清timer。project明確命令/讀取維持完整對帳。期限優先於當下才觀察到的terminal run；不依賴瀏覽器開啟。
- refreshMessageWaits用UPDATE RETURNING取得實際變更，狀態與message.wait.expired/cancelled事件/outbox同交易；reply的message.wait.responded亦在原send交易。無pending變更就不產生事件。
- tests/aether/message-waits.test.ts新增事件失敗trigger注入，證明整筆state rollback，解除故障後timer無讀取也能expire、重複timer不重複event、serverclose清timer。使用注入clock及受控timer，不以等待真時間湊綠。
- tests-wait-events.log52 passed；build-wait-events.logpassed；e2e-wait-events.log相關browser1 passed。自我審查，沒有子代理/付費模型/remote寫入。完整產品目標仍active，workflow模板、skills/schedules/ACP/A2A/connectors、完整3D美術/audio/perf/release仍未完成。

## 2026-10-01 07:53 — 工作流排程前置條件

- 讀取MASTER_SPEC工作流與native runner後，發現claim只有machine/global上限，沒有agent互斥；同agent可跨主機同時執行多工作，訊息/角色歸屬不穩。claim查詢加入同agent claimed/running/cancel_requested/indeterminate排除，仍在SQLite immediate交易內選取與claim。
- 優先順位改為priority + 每等待60秒一級，createdAt/id穩定排序，避免持续新高priority造成飢餓。既有全域4與機器上限、provider/project/live policy/workspace machine binding保留。
- scheduler.test兩案例：跨machine同agent互斥、cancel/unknown fence，低priority等待4分鐘勝過新priority3。tests-scheduler.log54passed、build-scheduler.logpassed。scheduler-mutation.log暫時移除兩修復，測試拒絕舊行為；finally還原後scheduler-restored.log2passed。未改UI，未重跑browser。自我審查，無子代理、付費模型。
- 完整跨provider workflow尚未實作，不把scheduler修復當template完成。下一步原生review執行須有purpose/固定target SHA/獨立checkout/限權MCP，且review run不可覆寫工程run的work狀態；避免把文字review或固定角色名冒充真reviewer。完整其餘規格仍active。

## 2026-10-01 08:02 — 固定 commit 的原生審查執行

- migration013加入run purpose/reviewHead/reviewVersion/reviewBase及workspace purpose。work.request_review明確選reviewer、驗版本/非self/livepolicy/sourceworkspace/noactive run，固定同machine入列。claim附purpose與固定base/head提示；review run結果不覆寫工程result/submittedBy/head/attempt。結果通過精確SHA/version後才記review及approve/changes_requested，stale/cancel/offline不冒充新決策。retry選工程run，verify選工程workspace。
- NativeExecutor建立獨立review-run branch/checkout；前後clean/head檢查，受限60KB base..head patch，嚴格JSON review schema。Codex read-only sandbox/networkoff/deny escalation；Claude限定Read/Glob/Grep且deny escalation；review session禁止任務寫入，保留訊息/knowledge提案。人類接受仍需verifier。
- 成果審查頁加入原生reviewer選單/explicitstart/歷史結果與SHA；Workspace區分purpose並不對reviewcheckout執行工程diff命令。新review GET有project/work scope。docs/NATIVE_REVIEW.md記錄證據邊界。
- review-runs.test5情境及native-review.test真Git+合成Codex程序通過；tests-review-ui.log60 passed5.75s。build-review-ui.logpassed；e2e-native-review.log1 passed33.4s，完整真HTTP/browser/runner合成工程退回修正→原生review→固定測試→人類接受，包含原有observe/PTY旅程。e2e-synthetic-review.png已看圖；未跑全6個browsersuite。self review，無子代理/付費模型。
- 此輪不宣稱W1/W2真雙provider或所有workflow模板完成。Claude新增readonly配置尚無新原生process證據；大patch審查拒絕，無分頁review。仍缺完整模板、平行integration、reservations/merge、skills/schedules/ACP/A2A/connectors/full3D/audio/perf/release。完整goal active。

## 2026-10-01 — 使用者要求啟動與實際操作示範

- 使用者要求「啟動當前專案讓我查看目前完成了哪些功能並且操作給我看」。確認4310無listener後，build-user-preview.log建置通過，setup --demo保留既有DB/token/專案並升級schema。以detached程序啟动built control15438/runner15439，AETHER_MODE=demo，移除nativeconfig，localhost4310 health=ok/demo；結尾再次核對PID與LISTEN。logs control-user-preview.log/runner-user-preview.log。
- agent-browser headed session aether-user-preview已開啟並登入，交給使用者操作。錄製起始會重建browsercontext遺失sessionStorage CSRF，最初建立回403；另外headed視窗頁面/對話框持續變化，為避免操作干擾，另開headless session aether-demo-record獨立操作並重新正式登入。曾有credential fill失敗的subprocess traceback包含demo token，已立即更換同一demoowner的tokenHash與owner-token檔案，舊token失效，既有資料保留；後續fill capture_output不輸出帶secret exception。
- 真UI建立「操作示範：確認任務派工」ff32e582-8ba5-48ed-8e3e-8b15cecc8f71，派Mika，fixture回report並待審查；建立「操作示範：前置完成後驗證」a58c36a8-cbce-4ee3-b3aa-c44024510f46依賴前者，DAG有實際edge、子taskbacklog。發送request訊息給Mika，展開等待紀錄；建立知識「操作示範：提交不等於完成」並以owner示範批准；原task審查要求修改，保留缺少verifier的邊界。資料留在demo，無付費模型。
- screenshots/user-demo-{task,dag,message,knowledge,review,office-final}.png為實際操作截圖；office-final已看圖，WebGL辦公室正常。record stop兩次因ffmpegmissing匯出失敗，沒有宣稱影片存在，對使用者說明以截圖呈現。未安裝全域工具。headed視窗不再操作或關閉；服務常駐保留。
- 開發續作：前次新增claude-review.mjs合成CLI及native-review.test參數化實際SDK路徑；claude-review-wire-first.log2passed，尚未跑整套和更新相關FEATURES。workflowtemplates尚未開始寫migration/commands。完整goal仍active，不把此次展示當productready。

## 2026-10-01 — 回覆真 session 接入、調研與完成度查核

- 讀現行observer→ObserverRunner→POST canonical ingestion→GET observations→React page鏈路並重跑observer/observer-runner/observation-control/native-review四檔：session-wiring-audit-current.log8 passed1.53s。合成內容、真檔案/HTTP/Git/SDK，未讀使用者私有transcript或啟動真付費model。
- 當前demo DB唯讀查詢：12 demo agents、runnerproviders=[demo]、observation_sources/records皆0。NativeExecutor只在live+nativeconfig載入；目前未接任何真session。設定一次核准root後可有限discover及持續poll；免設定接入、session自動建立3D角色與working狀態映射尚缺。
- SOURCES.json七clone HEAD及LICENSE hashes現查一致；agent-office記錄baseline執行，五repo選定模組調研、MCP Agent Mail僅授權排除。MASTER_SPEC列27GitHub repo，其他20沒有正式調研記錄。不是全部GitHub研究已完成。
- FEATURES.json144：implementation18 implemented/81 partial/45 not_started；verification16 passed/81 partial/45 not_run/2 blocked。16/144=11.1%只是已登記pass標記率，不能當完整產品完成率。額外24補充驗收尚未入表；文件有stale狀態（provider表PTY/Observe仍待完成、exec-plan舊26tests）。
- ocr-delegate preview/rules只用於本機規則選取，自我review七個接線檔，非1173全部審查；無agents。evidence/session-wiring-audit-current.json保存scope/統計/缺口，未修改source或開啟真觀察。完整goal仍active；使用者本輪是現況問答。

## 2026-10-01 — 27 repo 選型評估完成

- 完成 docs/research/repo-selection-2026-10-01/{REPORT.md,matrix.json,index.html,source-index.json}：27 個 public HEAD／README、26 個 LICENSE；multiagents 僅 README 宣告 MIT。13 個候選 partial clone，50 個固定 SHA 的選定 source/document 引用；不是全部程式碼審查。
- 主選 Orca（條件：普通 CLI hook bridge、安全 launch 預設、固定 SHA review／verifier／串行 integration gate）；GasTown 為 PM→queue 完整架構備選，agents-observe 為觀察先行。hcom 要啟動前綴，AgentDeck discovery 限 tmux，AgentTeamsAI 有 AGPL／backend／merge evidence 缺口。Orca 預設 permission bypass 與 observers Codex 範例缺 SubagentStart 都明示。
- evidence/adapter-assertions.log：8 個 source adapter/config 合成斷言通過；artifact-checks.json：27 unique rows／40-char SHA，桌面1280與手機390無水平溢出、原生 details 可展開；兩張 screenshot 已查看。未跑27個產品的runtime、未付費模型、未安裝hook／全域設定、未改產品執行碼、未合併／push。獨立 agent-browser research session，不干擾既有使用者demo。
- 下一步：選型若採 Orca，先 pinned checkout 與安全 launch argv fixture；再普通 CLI／跨 worktree／child parent grouping bridge 離線驗收，之後固定 SHA review 與合成 Git integration 負例。真 provider smoke 與遠端／合併仍須既有明確授權。原始完整產品目標仍未完成；此次完成的是使用者新要求的27 repo評估。

## 2026-10-03 — CLA-04 hook 安裝器（函式庫層）

- 新增 packages/providers/src/claude-hooks.ts：專案範圍 settings.json 的 hook install／update／remove。以 command 內 `aether-office-hook` 標記辨識自己的條目；使用者既有 hooks 與其他欄位原樣保留，install 冪等、remove 還原原內容；腳本路徑須為絕對且無 shell 特殊字元；JSON 無法解析即拒絕且不覆寫；首次寫入保留 `.aether-backup`，以 tmp＋rename 原子寫入。
- tests/aether/claude-hooks.test.ts 4 passed（evidence/tests-claude-hooks.log）；tsc 與 check-boundaries 通過。僅合成檔案，未對真 Claude Code 驗證 hook 欄位／事件名稱，未動任何全域設定。
- 尚缺：hook receiver 腳本（有界 timeout＋本地 spool→canonical ingestion）、opt-in CLI／UI 入口、真實版本相容驗收；因此 CLA-04 記為 partial，不宣稱 session 自動接入完成。
- 完整產品目標仍未完成：FEATURES 仍有 44 項 not_started（REM、STD/A2A、INT、GIT-03/06/08、QA 等）。

## 2026-10-03 — 本機 session 自動載入（observe-only）

- control `GET /api/local-sessions`（僅人類 owner/operator；`AETHER_LOCAL_SESSIONS=off` 關閉；`AETHER_LOCAL_SESSIONS_HOME` 覆寫 home）：掃描 ~/.claude/projects 與 ~/.codex/sessions 近 7 天最新 60 個 jsonl，只取 id／cwd／mtime（讀檔頭 64KB，不保留對話內容），並對最多 30 個 cwd 執行唯讀 `git status`（core.fsmonitor=false、GIT_OPTIONAL_LOCKS=0、4 秒逾時）取得 branch／upstream／ahead／behind／未提交數。5 秒快取。
- Web 把 session 轉成 provider=observe 角色加入 3D 場景與右側面板（不改存檔 layout，另補桌位）；活動狀態僅為 mtime 推測（2 分鐘內=working），面板明示 heuristic。
- 驗證：全套 vitest 27 檔 67 passed；build 通過；tsc／boundaries 通過；e2e（fixture home，不讀真實目錄）passed＋axe 無違規＋截圖已看。真實機器掃描只核對數量：60 sessions（claude 34／codex 26）、36 repos、437ms；未用真 UI 檢視。
- 未做：hook bridge（子代理 parent、worktree 身分、停止偵測）、受管派工；Claude 專案 id 與 cwd 為檔頭第一個 cwd，未處理 session 中途換目錄。完整產品目標仍未完成。
