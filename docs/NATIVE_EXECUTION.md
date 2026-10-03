# 原生代理與 MCP

目前為 development。Codex 合成 app-server + HTTP + SQLite + Git 整合測試、Claude message normalizer 與 MCP stdio 測試已執行；未呼叫真實付費模型。這些測試不能證明 provider 登入、網路、額度或外部服務可用。

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

尚未完成：實際外部 session 格式驗證、PTY 跨平台驗證與結果不明的人工結案、通用 ACP、完整跨 provider review/fix/verification workflow，以及 live smoke。不要把這些功能當成已可用。

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

這是 native JSON 的一個欄位；只有終端機時 binaries 可用空物件。Runner 公布 profile 名稱與設定 hash，UI 不接受任意 executable／argv／cwd。專案 live policy 也須啟用。點「終端機 → 啟動終端機」會真的執行此本機程式；不自動替它生成 task 成果或工具批准證據。

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
