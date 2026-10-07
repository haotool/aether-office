# AETHER OFFICE

[![CI](https://github.com/haotool/aether-office/actions/workflows/ci.yml/badge.svg)](https://github.com/haotool/aether-office/actions/workflows/ci.yml)
[![License: MIT](https://img.shields.io/badge/license-MIT-blue.svg)](LICENSE)

**看見並指揮你電腦上執行中的 Claude Code 與 Codex session。** AETHER OFFICE 會找出你已經開著的 CLI session，把每一個畫成 3D
辦公室裡坐在桌前的動物，並提供一個面板：閱讀對話、回答權限提示、查看 token 用量、清理被你遺忘的 session。可以在瀏覽器使用，
也可以用同一個網路內的手機。它是本機優先的：只有你電腦上的一個程序，不需要帳號，沒有雲端。

[English](README.md) · 繁體中文

> **狀態：預發行（`0.4.x`）。** 有大量自動化測試，但不是正式發行版。[驗收台帳](docs/verification/report.md)
> 明確列出哪些功能已驗證、哪些尚未。

適合同時開著多個 `claude` 或 `codex` 終端機的人：不必切換視窗，就能知道哪一個在工作、哪一個在等你、每一個做了什麼。

<p align="center">
  <img src="docs/images/office-overview-desktop.jpg" alt="3D 辦公室：儲存庫的 Git 歷史在大樓上方長成豆莖，右側是即時 session 面板" width="100%">
</p>

_所有截圖都來自合成的示範資料（虛構的儲存庫、作者與對話），見 [docs/images](docs/images/README.md)。截圖中的介面為英文。_

## 你會看到什麼

- **辦公室。** 每個 session 是一個角色，依其工作所屬的工程職位放到對應樓層。儲存庫的分支像豆莖一樣穿過大樓，
  歷史在頂端長成一座花園，每 12 個 commit 一朵花（[花冠特寫](docs/images/office-crown-desktop.jpg)）。
- **Session 面板。** 即時動態，依「需要你」、「工作中」、「剛完成」、「閒置」分組；點一個 session 就看到它的對話：
  Markdown 回覆、折疊成一行的工具呼叫、搜尋與複製。

<p align="center">
  <img src="docs/images/session-conversation-desktop.jpg" alt="側邊面板中一個工作中 session 的對話，三個子代理以小隊列出，並在辦公室的桌群中顯示" width="100%">
</p>

- **在面板或手機上回答權限提示**（需自行啟用，僅 Claude Code）。

<p align="center">
  <img src="docs/images/approval-card-desktop.jpg" alt="一個 shell 指令的權限請求以卡片顯示在工作中的 session 上方，有「Allow once」與「Deny」" width="100%">
</p>

- **Token 與 Git KPI**，涵蓋整棟大樓與每一層，由本機 transcript 統計。

<p align="center">
  <img src="docs/images/kpi-dashboard-desktop.jpg" alt="KPI 儀表板：依種類、每日、模型與專案統計的 token" width="100%">
</p>

- **子代理小隊。** 主管的子代理坐在它桌子旁；每次工具呼叫時光絲會繃緊，完成的結果會送到主管桌上。

<p align="center">
  <img src="docs/images/squad-strings-desktop.jpg" alt="一個子代理小隊圍著主管的桌子，上方有光絲牽引" width="100%">
</p>

- **直接操作角色**，只提供真的做得到的動作，做不到時會說明原因。

<p align="center">
  <img src="docs/images/character-menu-desktop.jpg" alt="角色的動作選單：表情、開啟對話、跟拍、看螢幕、在 AETHER 中繼續或分支" width="100%">
</p>

- **在手機上**，同一間辦公室，以及含動態、對話與批准卡片的底部面板。

<p align="center">
  <img src="docs/images/office-phone.jpg" alt="手機上的辦公室，有一個待批准的請求與成員列" width="30%">
  <img src="docs/images/sessions-phone.jpg" alt="手機上的即時 session 面板" width="30%">
</p>

## 快速開始

需要 Node.js **24.21.0**（`>=24.21.0 <25`）與 pnpm **12.8.1**（`packageManager` 欄位指定，Corepack 會安裝）。支援 macOS 與 Linux。

```sh
pnpm install --frozen-lockfile
pnpm build
pnpm start
```

開啟 `http://127.0.0.1:4310`（請用這個確切位址；`localhost` 會被刻意拒絕），用終端機印出**檔案位置**的 owner token 登入。
第一次啟動會建立 `.data/live`、token 與資料庫。你近期的 Claude Code 與 Codex session 會以「被觀察」的角色出現。
想用 fixture 資料試用、不看自己的 session：跳過建置，執行 `pnpm demo`，然後開啟 `http://127.0.0.1:4311`。

**用同一個 Wi-Fi 的手機：**

```sh
AETHER_HOST=0.0.0.0 pnpm start
pnpm run pair     # 在第二個終端機：印出給手機相機掃描的一次性 QR code
```

以 `AETHER_HOST` 啟動時，伺服器也會印出同一個 QR code。每個 code 只能用一次，五分鐘後失效。連線是純 HTTP，請先讀[限制](#限制)。

選用：`pnpm hooks install --project /path/to/repo` 加入精確的活動狀態，加上 `--remote-approvals` 則有批准卡片。
它會改動什麼，見[開始使用](docs/getting-started.md#exact-activity-with-hooks-optional)（英文）。

## 依工作分類的功能

| 工作     | 你得到什麼                                                                                                                                      |
| -------- | ----------------------------------------------------------------------------------------------------------------------------------------------- |
| **看**   | 以唯讀方式發現本機 Claude Code 與 Codex session；活躍、閒置、休眠、孤兒、殭屍狀態；導演鏡頭；控制室牆面；每張桌子旁的 context 用量與壓縮。      |
| **談**   | 含通知、Markdown、程式碼與搜尋的對話檢視；在 AETHER 終端機中執行的 session 的輸入框（`/` 指令、`@` 檔案、Stop）；快速回覆。                     |
| **批准** | Claude Code 的權限提示以卡片顯示在面板與手機上：允許一次、本次 session 都允許（僅限 Claude 自己提供的規則）、附理由拒絕。需自行啟用，預設關閉。 |
| **理解** | 職位與樓層分類及其證據；token KPI 與額度視窗；commit、合併與開啟中的分支；Git 豆莖；各 CLI 提供的模型清單。                                     |
| **整理** | 把閒置多日的 session 一次下班（`SIGTERM`，5 秒後 `SIGKILL`；transcript 永不刪除）；停止單一 session；清除殭屍程序；Git 健康與 worktree。        |
| **玩**   | 由真實訊號觸發的裝飾小動畫（橡皮鴨、測試燈、`git push` 時的火箭）、梗效果、首次造訪導覽。平靜模式可全部關閉。                                   |

除了 CLI 檢視，**設定 → 進階功能** 會開啟編排工作台：任務、審查、排程，以及在隔離的 Git worktree 中啟動 Codex 或 Claude、
逐次批准的 runner、MCP 工具、A2A 閘道與 ACP 客戶端。這部分次於上述功能，見[原生執行](docs/native-execution.md)（英文）。

## 限制

- **被觀察的 session 是唯讀的。** 你在自己終端機啟動的 session 可以被觀看、閱讀、停止（僅 owner）與清理，但不能對它輸入。
  只有在 **AETHER 終端機**內執行的 session 才有輸入框；其他 session 可以在那裡**繼續或分支**（`claude --resume`、`codex resume`），
  這需要啟用 `cliTerminals` 的 runner（[原生執行](docs/native-execution.md)）；未啟用時按鈕會說明。
- **Hooks 增加細節，但不是看見 session 的必要條件。** 沒有 hooks 仍有 session、對話、token，以及從 transcript 檔讀到的 Claude 子代理。
  精確的「工作中／等待批准」狀態、工具結果（成功或失敗）、辦公室效果用的指令標籤，以及**所有**遠端批准都需要 hooks。
  遠端批准僅支援 Claude Code，Codex 沒有對應機制。
- **區網上的純 HTTP。** token 與 session cookie 在網路上沒有加密。在手機上以純 HTTP 回答權限提示預設會被拒絕，除非使用 HTTPS
  （例如 Tailscale 通道）或設定 `AETHER_REMOTE_APPROVALS_LAN=1`。純 HTTP 下頁面無法安裝成 App、沒有離線外殼（service worker 需要安全環境）。
  見[開始使用](docs/getting-started.md#install-it-on-a-phone)（英文）。
- **不是沙盒。** 代理保有啟動它的使用者的檔案權限。AETHER OFFICE 不隔離代理，也無法防禦已經以你的身分執行的程式碼（[安全](docs/security.md)）。
- **單一受信任的操作者。** 沒有多使用者或多租戶模式。
- **平台。** macOS 與 Linux。終端機監督器不支援原生 Windows。
- **只有 token 數量，沒有金額。** 本機沒有價格表，所以不顯示費用。
- **預發行。** 許多功能只部分驗證，台帳會說明哪些。

## 隱私與安全

- **沒有雲端、沒有遙測。** 除非設定 `AETHER_HOST`，控制平面只監聽 `127.0.0.1`。程式碼中唯一的對外連線是選用的連接器（GitHub、Linear）
  與選用的 A2A 閘道；網頁不從任何 CDN 載入資源。不上傳任何東西，除非你把工作指派給 runner，否則不會呼叫付費模型。
- **唯讀發現。** 讀取 session 檔與程序表，不會寫入 `~/.claude` 或 `~/.codex`。transcript 文字只在你開啟該 session 時讀取，
  且在送到頁面前會遮蔽已知格式的密鑰。
- **Hooks 只記錄標籤，不記錄內容：** session id、事件名稱、工具名稱與簡短目標（例如檔案的 base name 或指令的第一個字），
  存在 `~/.aether/hook-events.jsonl`。不記錄提示、完整指令、參數或路徑。
- **預設強化：** 精確的 Host 與 Origin 檢查（防 DNS rebinding）、HttpOnly session cookie 加 CSRF token、由測試固定的授權矩陣、
  代理的文字永遠不當 HTML 渲染，批准結果有簽章，因此佔用 loopback 連接埠的程序無法替你回答。

威脅模型、每個端點的對象與區網檢查清單見 [docs/security.md](docs/security.md)（英文）。安全問題請透過 [SECURITY.md](SECURITY.md) 通報，不要開公開 issue。

## 運作方式

```
 Claude Code / Codex CLI                         你的電腦                              你的瀏覽器 / 手機
 ┌───────────────────────┐   檔案、程序表      ┌──────────────────────────┐  HTTP    ┌─────────────────────────┐
 │ 你啟動的 session      │ ─────────────────► │ 掃描器（唯讀）           │ ◄──────► │ 網頁 App（React）       │
 │ transcript、hooks     │   hook 記錄        │        │                 │  + SSE   │  面板、KPI、設定        │
 └───────────────────────┘ ─────────────────► │        ▼                 │ 變更串流 │          │              │
                                              │ 控制平面                 │          │          ▼              │
 ┌───────────────────────┐   claim / report   │ Fastify + SQLite、驗證、 │          │ 3D 辦公室場景           │
 │ runner（選用）        │ ◄────────────────► │ 指令、事件               │          │（Three.js，延遲載入）   │
 │ worktree、終端機      │                    └──────────────────────────┘          └─────────────────────────┘
 └───────────────────────┘
```

有人連線時，掃描器每兩秒讀取一次 session；一個共用的監看器把差異轉成不含內容的變更事件，頁面透過 server-sent events 接收，再重新取得資料。
runner 是獨立的程序，從不寫入資料庫。細節見[架構](docs/architecture.md)（英文）。

## 支援的供應商

| 供應商      | 已驗證版本                            | 備註                                                                              |
| ----------- | ------------------------------------- | --------------------------------------------------------------------------------- |
| Claude Code | 2.1.x 系列（以 2.1.289 檢查）         | Hooks、遠端批准、子代理、模型清單。                                               |
| Codex CLI   | 0.159.2、0.160.0、0.160.1（精確版本） | 觀察、hooks、模型、額度視窗。沒有遠端批准。未列出的版本會被拒絕，而不是假設相容。 |

ACP 代理與 A2A 1.0 閘道為選用。完整對照與新增版本的方法見 [docs/provider-compatibility.md](docs/provider-compatibility.md)（英文）。

## 文件

文件以英文撰寫，索引見 [docs/README.md](docs/README.md)。常用：
[開始使用](docs/getting-started.md) · [功能](docs/features.md) · [設定](docs/configuration.md) ·
[架構](docs/architecture.md) · [安全](docs/security.md) · [開發](docs/development.md) · [變更記錄](CHANGELOG.md)。

## 貢獻

歡迎貢獻。請閱讀 [CONTRIBUTING.md](CONTRIBUTING.md) 與[行為準則](CODE_OF_CONDUCT.md)。

## 授權

[MIT](LICENSE)。Copyright (c) 2026 haotool；部分程式 Copyright (c) 2026 AgentSystemLabs（本專案的起點
[agent-office](https://github.com/AgentSystemLabs/agent-office)）。第三方軟體與其條款見 [THIRD_PARTY_NOTICES.md](THIRD_PARTY_NOTICES.md)
與 [NOTICE](NOTICE)；授權清冊、授權政策與來源紀錄見 [docs/legal](docs/legal/README.md)（英文）。

AETHER OFFICE 是獨立專案，與 Anthropic 或 OpenAI 沒有隸屬、背書或贊助關係。Claude 與 Claude Code 是 Anthropic, PBC 的商標；
Codex 與 OpenAI 是 OpenAI 的商標。其他商標屬於各自的擁有者。
