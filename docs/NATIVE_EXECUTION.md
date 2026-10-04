# 原生代理與 MCP

目前為 development。Codex 合成 app-server + HTTP + SQLite + Git 整合測試、Claude message normalizer 與 MCP stdio 測試已執行；另有一次真實 live smoke（見下方「Live smoke」）。合成測試不能證明 provider 登入、網路、額度或外部服務可用。

使用專案指定 Node 24.21.0 與 pnpm 12.8.1，先 `pnpm install --frozen-lockfile`、`pnpm build`。`pnpm run setup` 建立 live control 資料與 owner token；token 路徑由 setup 輸出，不要貼到聊天或 commit。

Live control：`AETHER_MODE=live pnpm start`。登入後先建立有 repository 絕對路徑的專案，再執行一次 `pnpm run setup` 建立目前專案清單範圍內的 runner token。新增專案不會自動擴大舊 runner 權限，必須另行透過 `/api/machines` 註冊指定專案範圍。Native runner 預設關閉；另建立不加入版本控制、僅自己可讀的 JSON：

```json
{
  "enabled": true,
  "repositories": ["/absolute/path/to/your/repository"],
  "binaries": {
    "codex": "/absolute/path/to/codex",
    "claude": "/absolute/path/to/claude"
  }
}
```

不使用的 provider key 直接省略。只接受已查證的 Codex CLI 0.159.2、Claude Code 2.1.286；版本不符會拒絕啟動，不能假定新版本相容。

啟動 runner：

```sh
AETHER_MODE=live AETHER_NATIVE_CONFIG=/absolute/path/to/native.json pnpm runner
```

JSON 只授權本機能執行的 providers/repositories；每個專案 owner 還須在「設定 → 原生代理執行」明確啟用、設定回合與時間上限。儲存設定不啟動模型；派工才會啟動。關閉設定取消尚未開始的工作，對已開始的工作送出取消要求。取消結果不明時保持 indeterminate。

每個 writer 有獨立 Git worktree。來源主目錄的未提交修改不會帶入 worktree，也不會被刪除。Worktree 是工作隔離，並非 OS sandbox。Codex 使用 workspace-write、networkAccess=false、untrusted/user approvals；Claude 使用 SDK 的 default permission mode 與人工工具批准，不使用 bypass 模式。執行程式仍屬於信任本機 runner 的邊界。

MCP stdio 子程序由 runner 配置；身份 token 限定當次 run、agent 與 project，會在工作結束、取消、期限屆滿或 machine 撤銷後失效。不要自行把 owner token 填入 MCP。現有工具：whoami、list_work、get_inbox、get_message、send_message、ack_message、wait_for_message、propose_knowledge。訊息讀取不等於 ACK；send 重試必須保留同一 idempotencyKey 與參數；peer message 是不可信內容，不能授權工具或支出。

工具批准分為 pending、decided、decision_sent、provider_acknowledged。最後一個狀態需要提供者的實際工具事件，不能以「按下允許」冒充。批准只綁定單次 request/session/parameters hash；不支援 session-wide auto approval。

尚未完成：實際外部 session 格式驗證、PTY 跨平台驗證與結果不明的人工結案、通用 ACP、完整跨 provider review/fix/verification workflow，以及更長時間、真實程式修改的 live 驗證。不要把這些功能當成已可用。

## 固定版本驗證

本機 native JSON 可增加受信任測試器，runner 啟動時將它複製成不可修改的版本並公布 SHA-256：

```json
"verifiers": {
  "project-tests": { "file": "/absolute/path/to/trusted-verifier.mjs", "timeoutMs": 30000 }
}
```

這是 native JSON 內的一個欄位，不是完整 JSON 檔。測試器由 Node 執行，cwd 是受測 worktree；它屬於管理者信任的程式，不能採用代理臨時生成的檔案作為證明。任何測試前 dirty 狀態、測試前後 SHA/index/tree/base/測試器改變，都不會取得「已驗證」狀態。

測試器只繼承 PATH、HOME、USER、暫存目錄與語系等必要環境變數，不繼承 runner token、模型 API key 或其他自訂秘密。這不構成檔案系統隔離：HOME 與本機使用者可讀檔案仍在信任邊界內。POSIX 超時會終止本次建立的程序群組，即使主程序已退出但子孫程序仍占住輸出；Windows 尚未驗證程序樹終止。

成果審查通過後，owner 可選擇已公布的測試器執行。Runner job 先保存到日誌，再執行；重啟時不盲目重跑。成功證據與當時 head/version 相符才允許「接受此版本成果」。接受是控制台的版本確認，尚未實作合併或推送；不會把工作自動合併到使用者原始 repository。

## 退回修改與失敗重試

任務列表可對 failed／changes_requested 工作重試，由 owner／operator 觸發，預設總共最多三次執行。重試使用新 run/session／MCP 身份／工具批准，保留原 agent、machine 與 worktree（包含已提交和未提交檔案），並附上最近審查意見；舊審查和驗證不能沿用。前次執行結果不明、仍有工作區 job、機器已撤銷或 live 工作區缺失時拒絕重試。原機器離線時排隊等待，不能交給其他機器從乾淨 HEAD 重做。

預設使用新 provider session；勾選「接續原提供者對話」會恢復前次 Codex／Claude session，仍建立新的本平台 run、身份與批准範圍。Session ID 由 server 查詢前次執行，不接受用戶傳入任意 ID，並綁定原 provider、agent、machine 與工作區。缺少原 session 時拒絕；provider 回報不符時拒絕記錄為已啟動。達上限後 owner 可填寫原因，批准追加一次執行；operator 或 agent 不能提高上限。批准本身不啟動模型，仍需另外點重試，且不能累積未使用額度。次數不歸零，事件保存批准者、原因與新上限；單一工作最多 100 次，避免無界增長。合成 provider 的 HTTP／Git／SQLite 與瀏覽器流程已驗證，真 provider 尚未執行。

用量以 machine／agent／provider session／turn 作累計高水位，再將新增量歸入本次 run；同一 turn 的重播或較小累計不重複計入。這依赖 adapter 正確識別 turn 與用量語義；Codex 合成重播與累計增加已測，Claude resume 的真實帳務語義未實測。不能當成美元帳單證明。

## 工作診斷

任務詳情提供唯讀診斷，分開顯示機器心跳與最近工作事件。45秒未收到心跳標示機器離線；仍有心跳但至少60秒沒有工作事件，標示無新事件而非斷言程序死鎖。診斷辨識明確peer wait、工具批准等待／已決定待確認／過期、排隊、取消中、撤銷機器及indeterminate。Provider限流訊號目前未接入，不能把無輸出推測成限流。診斷不會重啟、終止或修改run狀態。

## 互動式 PTY

Native JSON 可加入固定的本機啟動設定；root 必須已在 repositories 授權清單，且與控制台專案 root 相同。例如（路徑須換成本機實際值）：

```json
"terminals": {
  "project-shell": {
    "binary": "/bin/zsh",
    "args": ["-f"],
    "root": "/absolute/path/to/your/repository",
    "timeoutMs": 600000
  }
}
```

這是 native JSON 的一個欄位；只有終端機時 binaries 可用空物件。

在 native JSON 加入 `"cliTerminals": true`，runner 會為每個已授權 repository 自動提供 `claude-<資料夾名>` 與 `codex-<資料夾名>` 兩個終端機設定，直接執行 `binaries` 裡的 CLI，可在瀏覽器使用它們自己的指令（slash commands、`/resume` 等）。不加任何參數，CLI 維持自己預設的權限詢問。這些互動 session 也會被本機 session 掃描讀到並分類到部門。Runner 公布 profile 名稱與設定 hash，UI 不接受任意 executable／argv／cwd。專案 live policy 也須啟用。點「終端機 → 啟動終端機」會真的執行此本機程式；不自動替它生成 task 成果或工具批准證據。

畫面預設唯讀；owner/operator 可明確接管，lease 30 秒，由输入續期。讀取與寫入分權限，epoch 防止舊接管者繼續輸入。重新載入頁面仍預設唯讀，程序持續執行；關閉頁面不停止程序。Resize、退出碼、停止及最新命令狀態可見。輸入先排隊，applied 只代表 runner 已寫入 PTY，不代表模型理解。不要在權限提示上盲目輸入。

本機 journal 在副作用前保存接受紀錄；HTTP 結果未知時不重送輸入，重啟後標記 indeterminate 並保留快照，不採用／終止磁碟紀錄中的 PID。活躍程序由本次 runner 的記憶體 handle 管理，停止對自有 POSIX 程序群組先 TERM，再 KILL。撤銷 runner 或關閉專案執行 policy 會要求終止其自有程序。結果不明的外部程序仍須人工檢查；人工結案 UI 尚未完成。

目前傳輸保留最近 8 KiB／最多 256 個輸出 chunk，超出時標示缺口；這不是完整 ANSI screen serialization，重新連線時若早期控制碼已被截斷，畫面可能不完整。OSC 52 剪貼簿請求被抑制，未載入開啟外部連結的 addon。沒有 OS sandbox，程序仍有本機使用者的檔案權限。

macOS 的真 PTY、真 HTTP、SQLite、重複命令、重啟不重送、Unicode、ANSI、resize、程序群組終止及 xterm 瀏覽器旅程已測；測試程式是明確標示的 Node fixture，不是已驗證真 Codex/Claude 互動模式。Linux/WSL2 未實測；native Windows 目前拒絕啟動此 supervisor。

## 外部唯讀觀察

先在 live 專案建立 provider=observe 的成員。從已授權的 `GET /api/projects/:projectId/snapshot` 取得完整 project.id 與該 agents[].id；目前詳情卡只顯示 ID 短碼，不能把短碼填入設定。Native JSON 加入以下欄位，並重新啟動 runner：

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

替換範例 UUID 與路徑。projectRoot 必須在 repositories 授權清單，且與控制台專案 canonical root 相同；檔案內 cwd 也必須相符。只需要觀察時 binaries 可為空物件，不會啟動模型。Claude 使用 provider=claude，經官方 SDK 唯讀介面解碼核准檔案。

files 是 approvedRoot 內的相對路徑；不接受越界或 symlink 來源。若明確設定 discover=true，會在核准根目錄內有限地搜尋 JSONL；不會自行掃描預設家目錄。每個設定最多64個來源；過大的目錄會明確報錯。移除或修改本機授權後必須重新啟動 runner。已移除授權的舊待送資料不會被新 runner 自動傳送，原 canonical 歷史也不會因此刪除。

「外部觀察」頁持續標示 OBSERVE／唯讀；可見文字沒有工具批准或任務完成權限。游標與待送 batch 在同一份 fsync 日誌保存，控制台用 reportId／source revision／record ID 去重；HTTP ACK 遺失可安全重試。每批按 UTF-8／JSON 大小限制分割，避免多位元文字超過 HTTP 上限。觀察傳送在獨立的非重疊工作中進行，網路失敗不阻塞一般派工。

最近讀取回報是本平台收到資料的時間，不等於外部程序心跳；最近新增觀察也不是 provider 的原始執行時間。沒有新可見記錄時顯示 stale／活性未知，機器失聯則顯示 offline。缺檔、未知格式、越界與資源上限都保留明確狀態，不顯示 idle／success。歷史可按序號向前分頁。

Codex／Claude 真 HTTP 的合成檔案與重啟、ACK遺失、磁碟寫入失敗測試，以及 Codex shape 的瀏覽器顯示／刪檔狀態已通過。未讀取使用者私有 transcript，尚無實際 provider 檔案的相容性證據。讀取上限與版本限制見 PROVIDER_COMPATIBILITY.md。

## Live smoke

`pnpm run smoke:live -- --confirm-subscription-quota [--only claude|codex|exchange]` 在拋棄式目錄與拋棄式 Git repo 內，用本機已安裝的 Claude Code 與 Codex CLI 啟動真實 session。它沿用 CLI 自己的登入（Claude.ai 訂閱與 ChatGPT 登入）：不讀、不寫、不需要任何 API key，且會消耗少量訂閱額度，所以沒有旗標就不執行。批准由腳本內明確的白名單決定：只允許 AETHER 協作工具（Claude 的 `mcp__aether__*`、Codex 的 `mcpToolCall` 且 server 為 aether），指令與檔案修改一律拒絕。

2026-10-04 在 macOS（Codex CLI 0.160.0、Claude Code 2.1.288）的結果，證據在 `evidence/live-smoke-*.json`：

- `--only codex`、`--only claude`：各一次真實 run，呼叫 `whoami`，回報的 agentId 與資料庫一致。
- `--only exchange`：Claude 以 `send_message` 傳出含 nonce A 的 request，Codex 以 `wait_for_message` 收到後回覆含 nonce B 與 nonce A 的訊息，Claude 讀到回覆；request 的投遞狀態為 `responded`。

這證明兩個 provider 能經 AETHER 的持久訊息互相通訊，不證明長時間穩定、Windows／Linux、或真實的程式修改工作流。Codex 以 elicitation 表達 MCP 工具批准（`_meta.codex_approval_kind = mcp_tool_call`），平台以單次呼叫的工具批准處理，從不接受它提供的「記住整個 session」。

## 進程生命週期：停止、倖存者、孤兒與殭屍

AETHER 同時處理兩種進程，規則不同。

**一、AETHER 自己啟動的進程**（`packages/providers/src/process-control.ts`）

- 每個子進程都以 `detached` 啟動，成為自己進程群組的組長；停止時對整個群組送 SIGTERM，等待有上限（預設 1 秒），再送 SIGKILL。忽略 SIGTERM 的進程不會永遠活著。ACP adapter 原本沒有獨立群組、也不升級到 SIGKILL，現在與其他三處（PTY、工作區執行、JSON-RPC）共用同一個 `groupStopper`。
- 計時器在子進程 `close`（所有管線關閉）時取消，而不是 `exit`：群組可能比組長活得久（子孫握著管線），而一旦全部結束，群組 id 就是已被回收的 pid，不能再送訊號。
- **PID 重用**：日誌記的是 `pid:啟動時間`（`ps -o lstart=`），不是 pid。runner 崩潰重啟時，`Runner.reapSurvivors()` 對日誌中尚未結束的 run 與終端機逐一判斷（`judgeSurvivor`）：不存在 → `gone`；啟動時間不同 → `reused`，絕不碰；殭屍 → `zombie`；仍有活著的父進程 → `owned`，留給它的父進程；只有「同一個進程、仍在執行、擁有它的已經不在」才是 `orphaned`，才送 SIGTERM（群組）→ 有上限的等待 → SIGKILL。每次送訊號前重新比對身分。以前的做法是「絕不碰持久化的 PID」，結果 runner 一崩潰，先前啟動的代理就變成孤兒繼續執行（持續消耗額度）。
- **孤兒不是 `ppid <= 1`**：在 `systemd --user` 下，孤兒由使用者管理員收養（它的 pid 很大且活著）。判斷是「父進程不存在、是 init，或是會收養孤兒的管理員」。這個坑來自 gascity。
- 絕不以名稱或命令列辨識要殺的進程（agent-deck 曾因此在一次掃描中殺掉全部約 65 個活著的 session）；身分是 pid＋啟動時間。

**二、使用者自己啟動的本機 Claude／Codex session**（唯讀觀察，`apps/control/src/services/`）

- 存活分兩個問題，各自回答：有沒有進程、裡面有沒有動靜。`session-liveness.ts` 把每個 session 分成 `active`（兩分鐘內有動靜）、`idle`、`dormant`（進程活著但靜止超過 6 小時）、`orphaned`（啟動它的已不在）、`ended`、`unknown`（Codex Desktop 的對話共用一個 app server）。動靜取最新的一個：transcript 寫入、hook 事件、CPU 時間增加（以 pid＋啟動時間為鍵記住上一次的 CPU 秒數，所以長時間編譯而 transcript 安靜的 session 不會被誤判為休眠），且不會比進程存活時間更久。
- **掃描全部存活的 session**：先查進程，再以進程為準找出對應的 session，不論多舊、多後面。過去只取最新 60 個，一個活了一天、transcript 安靜的 session 就消失了（真實資料中 10 個進程有 2 個被漏掉）。現在「每個有進程的 session 都顯示，其餘取最新 60 個」；找不到最近檔案的，用進程自己的資訊反查（Claude：`--resume` id，或其目錄對應的專案資料夾裡最新的檔案；Codex：rollout 檔名裡的 id）。檔頭解析結果（cwd 與 id 不會變）永久快取。
- **殭屍**（狀態 Z）在 macOS 只剩 `<defunct>`：沒有名稱、參數、也沒有工作目錄，所以無法直接對應到 session。它屬於**沒有收屍的父進程**，因此計入該 session 進程之下的 `zombies`（沿進程樹往下數）。殭屍不能被殺，要處理的是它的父進程（結束、或讓它 wait）。
- **停止**（只對 `dormant`／`orphaned`，僅擁有者）：`POST /api/local-sessions/:key/stop`。伺服器自己重新判斷狀態（不採信用戶端）、要求用戶端回傳它看到的啟動時間（防止停到另一個進程）、拒絕伺服器自己與其祖先、送出前再讀一次進程表，只送一次 SIGTERM 給那個進程本人（不送群組：它可能是某人的終端機工作）；忽略了就回報，不強制終止。記錄稽核事件 `local-session.stop.requested`。
- 3D 呈現：休眠 → 睡覺的兔子（座位上，飄著 Z）、孤兒 → 孤魂（半透明，飄在座位上方）、有殭屍 → 殭屍（僵屍，站在椅子後面，原地跳；成員本人仍在座位上）。

## 調研：27 個 repo 的做法與取捨

| 問題 | 做法（出處） | AETHER 的決定 |
|---|---|---|
| 孤兒判斷 | `ppid<=1` 在 systemd --user 下是錯的（gascity `pidutil/subreaper.go`） | 採用：父進程不存在、init 或收養孤兒的管理員 |
| 殺進程的身分 | 活著、非殭屍、已被收養、命令列與環境標記都吻合；絕不用名稱（gascity `orphan_reap.go`、agent-deck `reap-stale-tmux.sh`） | 採用 pid＋啟動時間；命令列不是身分 |
| 升級流程 | SIGTERM → 有上限的等待 → SIGKILL（gascity、orca） | 採用；等待的計時器在群組結束後取消，避免打到被回收的 pid |
| 進程樹終止 | 子進程 `detached`，對 `-pid` 送訊號（orca `process-tree-termination.ts`） | 已是如此；ACP adapter 補齊 |
| 父進程死亡的子進程 | 子進程輪詢 ppid，變成 1 就自殺（ruflo parent-death watchdog） | 不適用：被啟動的是第三方 CLI，無法在裡面加看門狗；改用重啟時的倖存者回收 |
| 存活的兩個維度 | 容器還在 vs 代理程序還在（gascity `runtime/liveness.go`、gastown 的 zombie：tmux 在、Claude 不在） | 採用：有無進程、有無動靜分開判斷 |
| 依賴 | orca、agent-deck、gascity 都自己寫進程樹與存活判斷；沒有人用 `ps-list`／`pidtree`／`tree-kill`／`pidusage` | **不加依賴**：現有的 `ps` 解析（零依賴）涵蓋同樣的欄位，並有真實進程的測試；少一個供應鏈風險面 |

## Claude 訂閱額度（5 小時與 7 天）

調研 27 個 repo，只有兩個真的做了，做法相反：

| 做法 | 出處 | AETHER 的決定 |
|---|---|---|
| 讀 Claude Code 傳給 `statusLine` 指令的 JSON 裡有文件記載的 `rate_limits`（`used_percentage`、`resets_at`）；明確拒絕讀憑證庫；不用本機 token 數算百分比；視窗重置後就不再顯示；溢量（>100%）不截斷；過期的數字照顯示但標記 | agent-deck `internal/quota/claude.go`、`model.go` | 採用它的原則：不讀憑證、不自己連網、不猜、不截斷、重置過了就不顯示 |
| 從 macOS Keychain 取出 OAuth token，帶著它呼叫 `api.anthropic.com/api/oauth/usage` | nimbalyst `ClaudeUsageService.ts` | **不採用**：要讀憑證庫並把 bearer token 送出去，是未公開的端點，而且每個需要這個數字的地方都得重複一次 |

這台機器已經有一份：使用者安裝的 claude-hud 外掛每約 5 分鐘（Claude Code 執行時）向用量端點問一次，結果放在 `~/.claude/plugins/claude-hud/.usage-cache.json`。AETHER 只讀這個檔（`services/claude-limits.ts`，上限 64 KB，只解析數字、方案名與時間，不記錄、不寫入），不碰憑證、不連網；`GET /api/claude-limits`（僅限人類 owner／operator）回傳，頂端列顯示「5 小時 · 7 天」用量，游標停留看重置時間、方案與資料時間。≥85% 變黃，資料超過 15 分鐘或外掛正在退避重試時變淡並註明；沒有這份檔就顯示「—」與原因。

要換成官方有文件的來源，只需讓使用者自己的 `statusLine` 指令把 `rate_limits` 寫進一個檔，再以 `AETHER_CLAUDE_USAGE_FILE` 指向它並加一個解析函式；AETHER 不會自己修改 `~/.claude/settings.json`。
