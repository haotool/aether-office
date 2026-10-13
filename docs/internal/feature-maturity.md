# 功能成熟度評估（實測版）

[文件索引](../README.md) · [專案首頁](../../README.zh-TW.md)

> [!NOTE]
> 此文件為當時版本的設計與研究紀錄；提案、量測及實作觀察不代表目前版本的支援狀態。
> 現行操作方式與驗證結果，請以操作指南及功能驗證台帳為準。

<details>
<summary>目錄</summary>

- [1. 執行摘要（維護者要知道的 10 句話）](#1-執行摘要維護者要知道的-10-句話)
- [2. 評分量表與方法](#2-評分量表與方法)
- [3. 成熟度矩陣](#3-成熟度矩陣)
- [4. 功能盤點（每區一列）](#4-功能盤點每區一列)
- [5. 首次使用實測（新使用者的前三分鐘）](#5-首次使用實測新使用者的前三分鐘)
- [6. 實測缺陷 Top 20](#6-實測缺陷-top-20)
- [7. 帳本 83 筆 partial：真缺口還是未填的阻擋文字](#7-帳本-83-筆-partial真缺口還是未填的阻擋文字)
- [8. 誠實缺口](#8-誠實缺口)
- [9. 本次評估的副作用與邊界（揭露）](#9-本次評估的副作用與邊界揭露)
- [10. 無法驗證的項目](#10-無法驗證的項目)
- [11. 各區上線準備度](#11-各區上線準備度)
- [12. 建議的 v1 範圍切線](#12-建議的-v1-範圍切線)

</details>

評估日期：2026-10-07（Asia/Taipei）。對象：`aether/product` 分支，版本 `0.4.0-dev.0`。方法：在獨立連接埠（4641 live 與原生執行 fixture、4642 demo）
起真實 control + runner，用 Playwright 以桌面 1440x900、窗寬 1920 至 768、手機 390x844 驅動畫面，並在乾淨 clone 執行 README 指令。
**本文件不以帳本（features.json）自述為準**；每個結論標明證據等級。範圍僅功能成熟度；開源風險（授權、歷史、倉庫體積等）另案。

證據等級：**R** = 我在執行中的應用實際操作並看過畫面；**R\*** = 實測，但對象是合成資料或假 CLI（fixture），非真實 Claude／Codex；
**E** = 只讀了 e2e／單元測試與帳本，未親自跑；**N** = 需要真實 CLI、真機手機、Safari 或其他作業系統，這裡無法驗證，不猜。

## 1. 執行摘要（維護者要知道的 10 句話）

1. 產品核心（觀察 Claude／Codex session、3D 辦公室、feed、對話、KPI、配對手機）在實測中**可用且整體相當細緻**：桌面與手機都無橫向捲動，axe 在 14 頁 x 2 主題 x 桌面與手機共 56 次掃描只有 1 項違規（設定頁淺色主題的對比度）。
2. 全產品平均 2.8／4（見第 3 節）：觀察者核心 3 至 4 分，工作台（orchestration）與整合多在 2 分，原因幾乎都是「只用 fixture／demo provider 驗證，真實 CLI 沒跑過」。
3. 帳本實為 **175 筆**（passed 92、partial 83；implemented 145、partial 30），不是 174／82；83 筆 partial 中，約 25 筆是功能尚未做完或刻意的限制，約 53 筆是「這台機器驗不到」（真實 CLI、其他 OS、真機 GPU）的驗證覆蓋缺口，另有 2 至 4 筆是已過期的阻擋文字（例：`OBS-LIFE-01` 說「尚無任何辦公室動畫」，實際已出貨 26 種）。
4. **首次使用體驗是最大的短板**：全新資料夾、零 session 時辦公室只說「建立第一個專案」，完全沒提「在終端機啟動 claude 或 codex 它就會出現」；介面預設語言寫死為繁體中文，英文瀏覽器的人第一眼看到的是中文登入頁。
5. 遠端核准（opt-in）端到端可行：真實 hook 腳本 → 面板卡片 → 「Allow once」→ hook 輸出正確的 allow JSON；但「核准」頁同時寫著「沒有等待中的權限」並叫你去開已經開了的功能（D05）。
6. 安全面良好：對話內含 `<script>`、`<img onerror>`、`javascript:` 連結、外部圖片、`sk-ant-`／`ghp_` 密鑰與 `<system-reminder>`，頁面沒有執行任何腳本、沒有對外發請求、密鑰被遮蔽、系統提示被摺疊。
7. 錯誤處理仍有「原始代碼外洩」：不存在的專案路徑回 `INTERNAL_ERROR`（500），過期專案 id 顯示 `PROJECT_NOT_FOUND` 加一個無效的 Retry；未知路由靜默顯示辦公室而非 404。
8. 版面有兩處可見缺陷：出現「Emergency stop」時頂部列在 1440 與 768 寬溢出，語言與主題按鈕被推到畫面外；手機頂部列專案名稱與狀態文字互相重疊。
9. 工作台的 demo 流程（建任務 → 指派 → 3 秒內進入審查）可跑通，但它驗證的是 fixture 程序，「真實 Codex／Claude 在隔離 worktree 工作」從未在這裡或帳本中被端到端驗證；A2A／ACP／整合（GitHub、Linear）沒有真實憑證驗證過。
10. 建議 v1 以「觀察者產品」收斂：保留並主打辦公室、feed、對話、KPI、角色、小隊、配對與遠端核准（標 Claude only、opt-in），其餘（Composer 終端、版面編輯器、整個工作台）標「實驗性」並維持 Advanced 之後；A2A／ACP／GitHub／Linear／遠端機器邀請建議隱藏。

## 2. 評分量表與方法

| 分  | 意義                                               |
| --- | -------------------------------------------------- |
| 0   | 不存在                                             |
| 1   | 原型：能示範但有明顯斷點                           |
| 2   | 可用，但有已知缺口（錯誤／空狀態／真實資料未驗證） |
| 3   | 穩固：主要路徑與錯誤路徑可靠，測試真實             |
| 4   | 產品級：我找不到可挑剔之處                         |

八個面向：**正確**（做對的事）、**UX**（操作與視覺完成度）、**狀態**（空／載入／錯誤／離線）、**無障礙**（鍵盤、語意、對比；僅自動化加我的 Tab 順序檢查，沒有螢幕閱讀器實測）、
**效能**（只有 Apple M4 一台機器的證據）、**安全／隱私**、**文件**、**測試**（真實而非 mock）。總分為八項平均。

做過的實測（皆在 fixture home，從未讀取 `~/.claude`、`~/.codex` 內容，沒有呼叫模型）：
頁面掃描（14 頁，zh 與 en）、axe（桌面與手機 x 深色與淺色）、首次使用（零 session、一個 session）、對話內容（Markdown、XSS、密鑰遮蔽）、KPI、設定全部分區、
配對（真實一次性碼：成功與重複使用）、遠端核准、Composer（假 Claude TUI：`/` 選單、`@` 檔案、送出、回覆）、PTY 終端、角色動作選單、版面編輯器、
任務／工作流程／審查、訊息／房間／會議、知識／Skills、離線與恢復、窗寬 1920 至 768、手機 390、80 個 session 的規模、hooks CLI 安裝／移除、README 指令。截圖在
倉庫外的暫存區（未納入倉庫）。

## 3. 成熟度矩陣

| 功能區                                         | 證據 | 正確 | UX  | 狀態 | 無障礙 | 效能 | 安全 | 文件 | 測試 | 總分    |
| ---------------------------------------------- | ---- | ---- | --- | ---- | ------ | ---- | ---- | ---- | ---- | ------- |
| 3D 辦公室（場景、鏡頭、樓層）                  | R    | 3    | 3   | 3    | 2      | 2    | 3    | 3    | 3    | **2.8** |
| 動態 feed 與對話面板                           | R    | 4    | 3   | 3    | 3      | 3    | 4    | 3    | 3    | **3.2** |
| Composer 與 AETHER 終端連結                    | R*   | 3    | 3   | 3    | 2      | 3    | 3    | 3    | 2    | **2.8** |
| 遠端核准（Remote approvals）                   | R*   | 3    | 2   | 3    | 2      | 3    | 3    | 4    | 3    | **2.9** |
| KPI／token 用量                                | R    | 3    | 4   | 3    | 3      | 3    | 3    | 4    | 3    | **3.2** |
| 角色與樓層分類                                 | R    | 2    | 3   | 3    | 3      | 3    | 3    | 4    | 3    | **3.0** |
| 小隊／subagent（3D 與面板）                    | R*   | 3    | 3   | 3    | 3      | 3    | 3    | 3    | 3    | **3.0** |
| 下班（clock-out）／停止／回收 zombie           | E    | 3    | 3   | 2    | 3      | 3    | 3    | 3    | 3    | **2.9** |
| 配對 QR／LAN／PWA                              | R    | 4    | 3   | 3    | 3      | 3    | 3    | 4    | 3    | **3.2** |
| 設定頁                                         | R    | 3    | 3   | 3    | 2      | 3    | 3    | 3    | 4    | **3.0** |
| 工作台：任務／DAG／審查／驗收                  | R*   | 3    | 2   | 3    | 2      | 3    | 3    | 3    | 3    | **2.8** |
| 工作台：Runner／原生執行（真實 Codex／Claude） | N    | 2    | 2   | 2    | 2      | 3    | 3    | 3    | 2    | **2.4** |
| 工作台：A2A／ACP／MCP                          | N    | 2    | 1   | 2    | 1      | 3    | 3    | 3    | 2    | **2.1** |
| 工作台：GitHub／Linear 整合                    | N    | 2    | 2   | 2    | 2      | 3    | 3    | 3    | 2    | **2.4** |
| 工作台：知識／Skills／排程                     | R    | 3    | 2   | 3    | 2      | 3    | 3    | 3    | 3    | **2.8** |
| 工作台：訊息／房間／會議／檔案預約             | R*   | 3    | 2   | 3    | 2      | 3    | 3    | 3    | 3    | **2.8** |
| 版面編輯器                                     | R    | 3    | 2   | 2    | 3      | 3    | 3    | 3    | 3    | **2.8** |
| 辦公桌螢幕                                     | E    | 3    | 3   | 3    | 2      | 3    | 3    | 3    | 3    | **2.9** |
| 辦公室小動畫（office life）                    | E    | 3    | 3   | 3    | 3      | 2    | 4    | 3    | 3    | **3.0** |
| 開場導覽                                       | R    | 3    | 2   | 3    | 3      | 2    | 3    | 3    | 3    | **2.8** |
| 角色造型（24 隻動物模型）                      | E    | 3    | 3   | 3    | 2      | 2    | 3    | 3    | 3    | **2.8** |
| 模型目錄                                       | R    | 3    | 3   | 3    | 3      | 3    | 3    | 2    | 3    | **2.9** |
| 診斷／doctor／hooks CLI                        | R    | 2    | 2   | 2    | 2      | 3    | 3    | 2    | 3    | **2.4** |
| 安裝與首次使用                                 | R    | 2    | 2   | 2    | 2      | 3    | 3    | 3    | 2    | **2.4** |
| 歷史／回放                                     | R    | 3    | 2   | 3    | 3      | 3    | 3    | 3    | 3    | **2.9** |
| 終端機頁（PTY）                                | R*   | 3    | 3   | 3    | 2      | 3    | 3    | 3    | 3    | **2.9** |
| 手機版介面                                     | R*   | 3    | 3   | 3    | 3      | 3    | 3    | 3    | 3    | **3.0** |

全產品平均 2.80

### 3.1 各區總結（一句話）

- **觀察者核心（3D 辦公室、feed、對話、KPI、配對）：3.0 至 3.4**。畫面完成度高；缺口是無障礙（無 skip link、3D canvas 無名稱）與只在一台 M4 上量過效能。
- **角色分類：2.9**。分類本身確定性且附證據，但帳本自述真實 session 準確率只有 48% 至 90%（50 筆人工標註），是整個產品最「看起來很準其實未必」的地方。
- **工作台：2.0 至 3.0**。UI 完整、demo 可跑，但缺真實 provider 驗證；任務詳情有 `Version 1 · 7566171e` 這類內部詞，必填欄位未標示。
- **安裝與首次使用、診斷：2.0**。這是 v1 前最值得花時間的地方（見 D01、D02、D03、D10）。

## 4. 功能盤點（每區一列）

受眾：**O** = 觀察者（CLI 使用者）、**W** = 工作台（多 agent 編排，Settings → Advanced 之後）。測試欄為 e2e 檔（括號是測試數）與單元測試檔名關鍵字；帳本 id 取自 `docs/verification/features.json`（175 筆，依前綴分組）。

| 區                                    | 受眾 | 位置                                                        | 帳本 id                                                          | 帳本狀態                                      | 覆蓋的測試                                                                                          |
| ------------------------------------- | ---- | ----------------------------------------------------------- | ---------------------------------------------------------------- | --------------------------------------------- | --------------------------------------------------------------------------------------------------- |
| 3D 辦公室、鏡頭、樓層、導演／控制室牆 | O    | `packages/office-scene`、`features/SceneView`、`OfficePage` | VIS-01..08、CAM-01..08、OBS-WALL-01、OBS-GRAPH-01、SCENE-PERF-P1 | VIS 與 CAM 多為 partial（效能與 VRAM 閘未完） | e2e `scene`(3)、`scene-context`、`director`、`z-characters`(8)、`perf`、`intro-perf`                |
| Feed 與對話                           | O    | `SessionPanel`、`SessionFeed`、`TranscriptView`、`Markdown` | OBS-PANEL-01、OBS-STREAM-01                                      | impl／partial                                 | e2e `session-panel`、`markdown-chat`、`text-pipeline`、`conversation-notices`(4)、`panel-resize`(9) |
| Composer 與終端連結                   | O    | `Composer`、`ContinueInAether`、`Terminals`                 | OBS-COMPOSER-01、RUN-01..08                                      | partial（假終端；真 CLI 未跑；僅 macOS）      | e2e `composer`(4)、`native-workflow`、`live-link`                                                   |
| 遠端核准                              | O    | `PermissionCard`、`Approvals`、`remote-approvals`           | OBS-APPROVAL-01、SEC-04                                          | partial                                       | 單元 `hook-approval`、`remote-approvals-hardening`、`permission-feed`；**無完整瀏覽器 e2e**         |
| KPI／用量                             | O    | `KpiDashboard`、`usage-*`                                   | OBS（含 INT-07、INT-08：無單價）                                 | impl／partial                                 | e2e `kpi`(6)、單元 `usage-*`                                                                        |
| 角色與樓層分類                        | O    | 純函式分類器、`docs/roles.md`                               | OBS-ROLE-01                                                      | partial（真實準確率 48%–90%）                 | 單元（合成語料與 50 筆人工標註）                                                                    |
| 小隊與 subagent                       | O    | `Squad*`、`SubagentView`                                    | OFFICE-LIFE-01..04、I7、I8                                       | partial（真 Claude hook 序列未錄）            | e2e `squad`(20)、`squad-panel*`(7)                                                                  |
| 下班／停止／回收                      | O    | `ClockOut`、`StopSession`、`reap`                           | （RUN 與 OBS 內）                                                | impl                                          | 單元；e2e 間接                                                                                      |
| 配對、QR、LAN、PWA                    | O    | `ConnectPhone`、`pairing`、`pwa`                            | SEC、REM-01                                                      | impl／partial                                 | e2e `pairing`、`pwa`(10)、`touch-flow`、`session-csrf`                                              |
| 設定                                  | O    | `features/settings/*`                                       | UIX-03、UIX-04                                                   | partial                                       | e2e `settings`(15)、`accessibility`                                                                 |
| 工作台：任務、DAG、審查               | W    | `Tasks`、`TaskDag`、`Reviews`                               | TSK-01..08、GIT-01..08                                           | TSK-04、TSK-05、GIT-06、GIT-08 partial        | e2e `workbench`、`dag`、`workflows`、單元 `control`、`kernel`                                       |
| 工作台：Runner／原生執行              | W    | `apps/runner`、`Machines`、`Workspace`                      | RUN、REM-01..08、CLA、CDX                                        | 多為 partial                                  | e2e `native-workflow`、`machine-invite`、單元 runner 系列                                           |
| A2A／ACP／MCP                         | W    | `A2AClients`、`packages/providers/acp`、`runner/mcp`        | STD-01..08                                                       | STD-03、STD-07 partial                        | e2e `a2a`、單元                                                                                     |
| GitHub／Linear                        | W    | `Integrations`、`connectors`                                | INT-01、INT-02                                                   | partial（無真實憑證；不能開 PR、不回寫）      | e2e `integrations`（對假服務）                                                                      |
| 知識、Skills、排程                    | W    | `Knowledge`、`Skills`、`Schedules`                          | INT-04 等                                                        | INT-04 partial                                | e2e `knowledge`、`skills`、`schedules`                                                              |
| 訊息、房間、會議、預約                | W    | `Messages`、`Rooms`、`Meetings`、`Reservations`             | MSG-01..08                                                       | MSG-05、MSG-07 partial                        | e2e `rooms`、`meetings`、`reservations`、`message-waits`                                            |
| 版面編輯器                            | O    | `LayoutEditor`、`layout-merge`                              | OFFICE-LIFE-02                                                   | partial                                       | e2e `layout-editor`(2)                                                                              |
| 辦公桌螢幕                            | O    | `office-scene`（桌面顯示）                                  | OBS-CHAR-01                                                      | impl                                          | e2e `scene`                                                                                         |
| 辦公室小動畫                          | O    | `life-*`                                                    | OBS-LIFE-01..03、F1                                              | partial（單機量測）                           | e2e `office-life`(20)、`office-life-scene-preview`、`office-life-perf`                              |
| 開場導覽、房間導覽                    | O    | `tour.ts`、intro                                            | OBS-LIFE-02、CAM-01                                              | partial                                       | e2e `intro`(7)、`tour`、`intro-perf`                                                                |
| 角色造型                              | O    | `tools/blender`、`avatar`                                   | VIS-04、VIS-08                                                   | partial                                       | e2e `avatars`、`validate-assets`                                                                    |
| 模型目錄                              | O    | `models.ts`、`ModelsSection`                                | （CLA／CDX 周邊）                                                | impl                                          | 單元                                                                                                |
| 診斷與 hooks CLI                      | O    | `scripts/doctor.ts`、`hooks.ts`                             | ENV-07、CLA-04                                                   | CLA-04 partial                                | 單元 `claude-hooks`、`hook-bridge`                                                                  |
| 安裝與首次使用                        | O    | `README`、`scripts/setup.ts`                                | ENV-01..08、UIX-01                                               | UIX-01 partial（「無引導式 live 上手」）      | `verify:clean` 腳本                                                                                 |
| 歷史與回放                            | O    | `History`、`replay`                                         | ARC-07、EVT                                                      | impl                                          | e2e `replay`                                                                                        |
| 終端機頁                              | O    | `Terminals`、`pty`                                          | RUN-03、RUN-04                                                   | partial                                       | e2e `composer`、`native-workflow`                                                                   |
| 手機介面                              | O    | `PhoneOffice`、`TabBar`                                     | OBS-PANEL-01                                                     | partial（無真機）                             | e2e `responsive`、`touch-flow`、WebKit 專案（需手動開啟）                                           |

測試總量：單元／整合 244 檔、約 1301 個 `it`；e2e 55 檔、182 個 `test`（最近一次 `evidence/e2e-results.json` 只是部分執行：27 檔、103 通過、3 略過、0 失敗；完整套件我沒有跑，因為 4320／4330 屬維護者）。

## 5. 首次使用實測（新使用者的前三分鐘）

起點：全新 data dir、零 session、live 模式（連接埠 4641）。

| 時間 | 畫面／行為                                                                                                                  | 困惑點                                                                                 |
| ---- | --------------------------------------------------------------------------------------------------------------------------- | -------------------------------------------------------------------------------------- |
| 0:00 | `pnpm start` 輸出一行位址與「owner-token 檔案位置」                                                                         | 使用者必須自己 `cat` 檔案貼上；`localhost` 會得到 403（README 已寫，但終端機輸出沒提） |
| 0:20 | 登入頁，**預設繁體中文**（瀏覽器是 en-US 也一樣），右下有「English」連結                                                    | D02：非中文使用者第一眼就困惑                                                          |
| 0:40 | 辦公室只有「建立第一個專案」按鈕（見 `shots/A02-empty-office.png`、`P01-paired-phone.png`）                                 | D01：沒有任何一句說明 session 會自動出現；頂部列的 CODEX／CLAUDE 顯示「—」也沒解釋     |
| 1:00 | 按「建立專案」→ 要填名稱與「授權儲存庫路徑（選填）」                                                                        | 填一個不存在的路徑 → 紅字 `INTERNAL_ERROR`（D03）                                      |
| 1:30 | （若使用者改去啟動 claude）一個 session 在約 5 秒內出現：專案自動以 repo 名建立，角色立刻出現在辦公室，面板分組為「剛完成」 | 這是產品最漂亮的一刻，但**前面兩分鐘沒人告訴你它會發生**                               |
| 2:00 | 設定頁「終端機指令」區提示 `pnpm run doctor`、`pnpm hooks install`                                                          | 沒有一鍵檢查；doctor 在只裝一種 CLI 時以失敗碼結束（D10）                              |

一個 session 時：辦公室、面板、KPI 都正確（自動採用 repo 為專案、角色分類為「前端工程師」附證據）。**備註**：自動採用會略過 `/tmp/` 與 `/private/tmp/` 下的 repo（刻意設計），所以在暫存目錄試用的人會看到「0 session」而頂部列計數卻是 4 —— 我自己第一次實測就踩到這點。

### README 指令逐條執行（乾淨 clone，HEAD `62ccd92`）

| 指令                                                 | 結果                                                                                                                                                                                                 |
| ---------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `pnpm install --frozen-lockfile`                     | 成功（暖快取，0.8 秒；冷快取未測）                                                                                                                                                                   |
| `pnpm build`                                         | 成功，約 9 秒                                                                                                                                                                                        |
| `pnpm start`                                         | 成功；`127.0.0.1:4641` 回 200、`localhost` 回 403，與 README 一致（我用 `PORT=4641` 代替 4310）                                                                                                      |
| `pnpm run setup`、`pnpm setup`                       | 成功（`pnpm setup` 沒有被 pnpm 內建指令遮蔽）                                                                                                                                                        |
| `pnpm run doctor`                                    | 在沒有 claude CLI 的機器以退出碼 1 結束；另有 `codex-schema version_mismatch`（協定 schema 為 0.159.2，安裝的 CLI 是 0.160.1），而 README 的「已驗證版本」表列了 0.160.1 → 文件與診斷互相矛盾（D10） |
| `AETHER_HOST=0.0.0.0 pnpm start`                     | 未真的對外綁定；用 `AETHER_HOST=127.0.0.1` 加 `AETHER_E2E_LAN_ADDRESSES` 驗證：會印 LAN 位址、純 HTTP 警告與 QR code                                                                                 |
| `pnpm run pair`                                      | 無 LAN 時給出清楚指示；有 LAN 時成功。伺服器用不同 data dir 時訊息誤導為「(401). Is the control plane running?」（D20）                                                                              |
| 配對連結                                             | 手機視窗開連結 → 直接登入；同一碼第二次使用 → 「配對碼已失效或已使用過，請在電腦上重新產生，或輸入權杖」（良好）                                                                                     |
| `pnpm hooks install／status／remove --project <dir>` | 成功、冪等、移除後留下 `.aether-backup`；`--remote-approvals` 另會把兩支腳本複製到 `~/.aether/hooks/`（文件有寫，但無環境變數可改位置，見 D14）                                                      |
| `pnpm demo`                                          | **未執行**：它固定使用 4310／4311，會與維護者的 live 伺服器衝突；改用等價的 demo 模式伺服器（4642）驗證                                                                                              |
| 文件連結                                             | 194 個相對連結全部有效                                                                                                                                                                               |

## 6. 實測缺陷 Top 20

嚴重度：高 = 影響首次使用或資料正確；中 = 明顯缺陷但有繞路；低 = 打磨。工作量：S（小時）、M（天）。

| #   | 嚴重度 | 缺陷                                                                                                                                                                             | 重現步驟                                                       | 證據                                                                                                | 建議修法                                                                                                                  | 工作量 |
| --- | ------ | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | -------------------------------------------------------------- | --------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------- | ------ |
| D01 | 高     | 零 session／零專案的空狀態沒有任何上手說明                                                                                                                                       | 全新 data dir 登入                                             | `shots/A02-empty-office.png`、`P01-paired-phone.png`                                                | 空狀態文案：「在專案資料夾的終端機啟動 claude 或 codex，它會在幾秒內出現」，附 doctor 與 hooks 指令；「建立專案」降為次要 | S      |
| D02 | 高     | 介面語言寫死 `zh-TW`，不看 `navigator.language`；登入頁亦同                                                                                                                      | 以 en-US 瀏覽器開登入頁（`state.ts` 的預設 `locale: 'zh-TW'`） | `shots/A01-login.png`                                                                               | 首次依 `navigator.language` 決定，存入偏好；README 是英文優先                                                             | S      |
| D03 | 中     | 建立專案時路徑不存在 → 500 `INTERNAL_ERROR` 原樣顯示                                                                                                                             | 新增專案、路徑填 `/nonexistent/path/xyz`                       | `shots/C02-create-project-bad.png`；控制端日誌 `INTERNAL_ERROR`                                     | 伺服器驗證路徑並回 4xx 明確碼；前端把碼翻成句子                                                                           | S      |
| D04 | 中     | 過期或錯誤的專案 id 顯示原始 `PROJECT_NOT_FOUND` 加無效的「Retry」                                                                                                               | 開 `/office?project=bogus-id`                                  | `shots/E-_office_project_bogus_id.png`（`/tasks?project=<不存在 uuid>` 同）                         | 自動改選第一個專案並提示；不顯示 Retry                                                                                    | S      |
| D05 | 中     | 核准頁在有待處理請求時仍寫「沒有等待中的工具批准，請先開啟遠端批准」（功能其實已開）                                                                                             | 開啟遠端核准、送一筆 PermissionRequest，開 `/approvals`        | `shots/AP2-approval-card.png`（同一畫面右側面板有卡片，頁首橫幅寫「A session needs you」）          | 核准頁也列出 `permission-requests`，或空狀態文案依功能是否已開分支                                                        | S      |
| D06 | 中     | 原生執行模式（顯示「Emergency stop」）下頂部列在 1440 與 768 寬溢出（1280、1024、1920 正常；demo 模式在 1440 正常），語言與外觀按鈕被推出畫面                                    | 原生執行模式（有 runner）開辦公室，窗寬 1440 或 768            | 量測：1440 時 `scrollWidth` 1534 對 1440、768 時 872 對 768；`shots/N2-terminal.png`、`N5-conv.png` | 頂部列允許換行或把次要控制收進選單；加入 1440 與 768 的 e2e 斷言                                                          | S      |
| D07 | 中     | 手機頂部列：專案名稱與「Live」狀態、Emergency stop 文字互相重疊                                                                                                                  | 手機寬度（390）開有 runner 的專案                              | `shots/PH1-office.png`                                                                              | 手機隱藏狀態字或截斷專案名稱                                                                                              | S      |
| D08 | 低     | 每一頁、每種語言的文件標題都是 `AETHER OFFICE · 軌道辦公室`（WCAG 2.4.2）                                                                                                        | 讀 `document.title`（office、tasks、settings…）                | 腳本輸出（五頁相同）                                                                                | 標題隨頁面與語言：「核准 · AETHER OFFICE」                                                                                | S      |
| D09 | 中     | 用量剖析器以位元組比對 `"usage":{`，且 `message.id` 必須在其前 300 字元內、JSON 必須緊湊；任何不符的行被默默略過，掃描仍顯示 `complete`、`skippedLines: 0`，KPI 為 0             | 我自己的 fixture 因鍵順序不同得到 0 token 且無任何警告         | `usage-parse.ts` 第 123 至 175 行；實測 `scan.complete: true` 且全為 0                              | 把「有 usage 卻無 id」的行計入 `skippedLines` 並在 KPI 顯示警告；加鍵順序變動的測試                                       | M      |
| D10 | 中     | `pnpm run doctor` 缺任一 CLI 就以退出碼 1 結束；`codex-schema version_mismatch` 的訊息是維護者用語（「regenerate and re-run the provider tests」），且與 README 已驗證版本表矛盾 | 在只有 codex 0.160.1 的機器執行                                | doctor 輸出（第 5 節）                                                                              | 缺可選 CLI 只警告；版本不在表內時說「未驗證，可能可用」；對齊 README                                                      | S      |
| D11 | 低     | 開場導覽的「Skip／Don't show again」與樓層 HUD 的「TOKENS TODAY」重疊                                                                                                            | `?intro=force`，1440x900                                       | `shots/IN2-intro-10s.png`                                                                           | 導覽控制移到不與 HUD 重疊的位置                                                                                           | S      |
| D12 | 低     | 設定頁淺色主題有 7 處對比度不足（axe `color-contrast`）                                                                                                                          | 桌面、淺色主題掃 `/settings`                                   | axe 輸出（其餘 55 次掃描皆無違規）                                                                  | 調整對應 token                                                                                                            | S      |
| D13 | 低     | 表單打磨：必填欄位無標示（知識「Source」）、原生驗證氣泡是作業系統語言（英文介面出現中文）、相依任務多選框看起來像未標籤的清單、任務詳情露出 `Version 1 · 7566171e`              | 開「建立任務」「提議知識」並送出空表單                         | `shots/B32-task-empty-submit.png`、`W8-kn.png`、`B33-task-details.png`                              | 標星號與行內錯誤；隱藏版本雜湊                                                                                            | S      |
| D14 | 中     | `pnpm hooks install --remote-approvals --project X` 會寫入使用者全域 `~/.aether/hooks/`，且沒有環境變數可改位置，無法在測試中沙箱化                                              | 執行後 `ls ~/.aether/hooks`                                    | 文件有寫（security.md），但本次評估因此改動了維護者的真實檔案（見第 9 節）                          | 增加 `AETHER_HOME`（或沿用 `AETHER_APPROVALS_CONFIG` 的目錄）                                                             | S      |
| D15 | 低     | 設定頁說模型目錄「讀自快取，沒有執行模型」，快取過期時實際上會執行 PATH 上的 `codex debug models`（來源標示 "From the CLI"）                                                     | 設定 → 模型與執行                                              | `packages/providers/src/models.ts` 第 210 行；畫面「From the CLI · 19:47」                          | 文字誠實說明會呼叫 CLI                                                                                                    | S      |
| D16 | 中     | 無障礙骨架不足：沒有 skip link；3D `canvas` 沒有可存取名稱；從頁首到側邊導覽尾端超過 14 次 Tab；帳本 A11Y-08 自述「沒做過螢幕閱讀器」                                            | 在辦公室連按 Tab                                               | Tab 順序輸出、landmark 檢查                                                                         | 加 skip link、canvas `aria-label`／`role="img"` 與替代文字摘要；做一次 VoiceOver 實測                                     | M      |
| D17 | 低     | 未知路由靜默顯示辦公室，沒有 404                                                                                                                                                 | 開 `/nonexistent-page`、`/settings/nope`                       | `shots/E-_nonexistent_page.png`、`E-_settings_nope.png`                                             | 導向或顯示「找不到頁面」                                                                                                  | S      |
| D18 | 低     | 手機點擊目標 36 px（低於 44 px）：3D／2D 切換、關閉、聚焦、KPI                                                                                                                   | 手機 390 寬量測 12 個控制項                                    | 量測輸出                                                                                            | 提高到 44 px                                                                                                              | S      |
| D19 | 低     | 版面編輯器是純數字表單（X／Z 公尺、物件下拉 `desk-0`），對話框蓋住場景，儲存前看不到效果                                                                                         | 辦公室 → 編輯版面                                              | `shots/LY1.png`                                                                                     | 標「實驗性」，或加即時預覽                                                                                                | M      |
| D20 | 低     | `pnpm run pair` 在伺服器使用不同 data dir 時說「(401). Is the control plane running?」                                                                                           | 對 4641 的伺服器用另一個 data dir 執行                         | 輸出（第 5 節）                                                                                     | 區分「連不到」與「權杖不符」                                                                                              | S      |

另有兩項小觀察不列入 Top 20：頂部列計數（會話 004）與當前專案的面板（0 個）在多專案時口徑不同；Sessions 表中剛被寫入 5 秒的 session 顯示「idle · none／已結束」，與 feed 的「剛完成」措辭不一致。

### 結案狀態（2026-10-09 補入）

下表逐項對照目前程式碼，每一項都有會失敗的測試把關。唯一未結的是 D16 的真機螢幕閱讀器實測，它需要人與裝置，列在[發佈檢查表](../release/publishing-checklist.md)。

| #   | 狀態                       | 現況                                                                                                                  | 把關的測試                                                                                         |
| --- | -------------------------- | --------------------------------------------------------------------------------------------------------------------- | -------------------------------------------------------------------------------------------------- |
| D01 | 已修                       | 空狀態是首次使用面板：說明 session 會自動出現、附可複製的指令，「建立專案」降為次要                                   | `e2e/settings/first-run.spec.ts`（nothing is running yet）                                         |
| D02 | 已修                       | 首次依 `navigator.language` 決定語言，已存的偏好優先；登入頁同                                                        | `tests/aether/first-run.test.ts`、`e2e/settings/first-run.spec.ts`（language follows the browser） |
| D03 | 已修                       | 伺服器回 400 `PROJECT_ROOT_NOT_FOUND`，前端翻成句子                                                                   | `tests/aether/project-root.test.ts`、`tests/aether/error-text.test.ts`                             |
| D04 | 已修                       | 錯誤的專案 id 改選第一個專案並顯示短提示，沒有 Retry                                                                  | `e2e/settings/first-run.spec.ts`（an address that names a project that is not there）              |
| D05 | 已修                       | 核准頁列出待處理的權限請求；空狀態依「遠端核准」是否開啟分支                                                          | `e2e/settings/first-run.spec.ts`（the Approvals page）                                             |
| D06 | 已修                       | 原生執行模式的頂部列在 320 至 1920 px 都不溢出（選擇器讓位、停止鈕在窄寬只顯示圖示）                                  | `e2e/ui/responsive.spec.ts`（每頁每寬度：無橫向溢出、控制項不互壓）、UX 矩陣                       |
| D07 | 已修                       | 手機頂部列的專案名稱、狀態與停止鈕不再重疊                                                                            | 同 D06                                                                                             |
| D08 | 已修                       | `document.title` 隨頁面與語言，待處理數在最前                                                                         | `tests/aether/first-run.test.ts`、`e2e/settings/first-run.spec.ts`（the tab title）                |
| D09 | 已修                       | 用量剖析器能讀位元組捷徑漏掉的行，讀不了的行計入 `skippedLines`                                                       | `tests/aether/usage-parse.test.ts`                                                                 |
| D10 | 已修                       | doctor 缺可選 CLI 只警告，版本依 `compat.json` 判斷，並有 `--strict`                                                  | `tests/aether/doctor.test.ts`                                                                      |
| D11 | 已修                       | 開場說明移到樓層 HUD 之外                                                                                             | `e2e/office-life/intro.spec.ts`、`e2e/scene/scene-hud-consistency.spec.ts`                         |
| D12 | 已修                       | 淺色主題對比度符合 4.5:1，axe serious 為 0                                                                            | UX 矩陣的 axe 檢查（兩主題）、`e2e/settings/first-run.spec.ts`                                     |
| D13 | 已修                       | 必填欄位有標示與行內錯誤（不再出現作業系統語言的氣泡）；版本與 id 收進「詳細資料」；相依任務欄有標籤與說明            | `e2e/settings/first-run.spec.ts`（forms say what is missing）                                      |
| D14 | 已修                       | `AETHER_HOME` 可搬移 `~/.aether`；`hooks install` 先列出會寫入的檔案並支援 `--dry-run`                                | `tests/aether/aether-home.test.ts`                                                                 |
| D15 | 已修                       | 文案說明快取過期時會執行 `codex debug models`（不啟動模型 session）                                                   | `tests/aether/i18n.test.ts`（兩種語言鍵相同、無空文案；文案由人讀過）                              |
| D16 | 程式面已修，真機實測待人工 | 有 skip link、`main`／`nav`／`complementary` landmark、3D canvas 的名稱與一句內容說明；VoiceOver／TalkBack 實測尚未做 | `e2e/settings/first-run.spec.ts`（the keyboard skeleton）、axe                                     |
| D17 | 已修                       | 未知路由顯示「找不到頁面」並連回首頁，兩種語言                                                                        | `e2e/settings/first-run.spec.ts`（an address that is no page）                                     |
| D18 | 已修                       | 手機與平板上每個控制項都有 44 px 的觸控區（繪製 36 至 40 px，加上隱形的擴充區）                                       | `e2e/ui/role-variance.spec.ts`（every control reaches a 44px hit area）                            |
| D19 | 已修                       | 標示「Edit layout (experimental)」，編輯時場景保持可見                                                                | `e2e/settings/first-run.spec.ts`（the layout editor says it is experimental）                      |
| D20 | 已修                       | `pnpm run pair` 區分連不到、權杖不被接受與其他回應                                                                    | `tests/aether/pair-cli.test.ts`                                                                    |

## 7. 帳本 83 筆 partial：真缺口還是未填的阻擋文字

分類依據是各筆 `blockers` 內容與我的實測。數字為約略，因為少數筆跨類別。

| 組                                           | 約略筆數    | 代表 id                                                                                                                                                                                                        | 判定                                                                                                                |
| -------------------------------------------- | ----------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------- |
| A. 需要真實、已登入、會花錢的 CLI 才能驗     | 約 26       | CLA-01／02／03／04／05／07、CDX-03／06、MSG-05、TSK-04／05、STD-03、INT-01／02、OBS-COMPOSER-01、OBS-APPROVAL-01、OBS-LOCAL-01、RUN-05／06／07、OFFICE-LIFE-01／I7-01／I7-02／I8-01／I8-02                     | **真缺口，但是「驗證缺口」不是「功能缺口」**。程式碼在合成資料上行為正確；v1 必須如實標示「僅以合成 provider 驗證」 |
| B. 只在 macOS arm64 驗過                     | 約 9        | RUN-01／02／03／04／08、REM-01／07／08、QA-01                                                                                                                                                                  | 真缺口；README 宣稱支援 Linux，但 Linux 與 WSL2 一次都沒跑過                                                        |
| C. 只在一台 Apple M4 量過、無真機、無 Safari | 約 18       | VIS-01..05／08、CAM-01／08、OBS-GRAPH-01、OBS-PANEL-01、OBS-CHAR-01、OBS-WALL-01、OBS-LIFE-02／03、OFFICE-LIFE-03／04、F1-02／F1-03、SCENE-PERF-P1、OBS-LIFE-I8-03                                             | 真缺口（效能與觸控）。這是開源前最可能被使用者回報的一類                                                            |
| D. 功能上尚未做完或有刻意限制                | 約 25       | ARC-03／04、GIT-06／08（無 PR 交接）、SEC-06、STD-07、INT-04、INT-07／08（無單價）、MSG-07、UIX-01／03／04（本次實測證實：無引導上手、原始錯誤碼）、A11Y-01／08、QA-02..06、OBS-ROLE-01、OBS-STREAM-01、SEC-04 | **真缺口**；其中 UIX-01、UIX-04 與本報告 D01、D03、D04 直接對應                                                     |
| E. 過期的阻擋文字（功能已出貨，文字未更新）  | 至少 2 至 4 | OBS-LIFE-01（「尚無任何辦公室動畫」，實際已有 26 種）、OFFICE-LIFE-I7-03（「網頁尚未使用 conflicts」，`life-signals.ts` 已使用）、OBS-LIFE-03、OBS-LIFE-09 的「待 I7」字樣                                     | 只是文字債，應更新帳本；它同時說明帳本的 partial 數字會**高估**缺口                                                 |

另外兩條對外誠信相關的發現：帳本總數與維護者所述（174／82）不同，實為 175／83；README 在「已驗證版本」表列 Codex 0.160.1，而 doctor 對 0.160.1 報 `version_mismatch`。

## 8. 誠實缺口

**文件承諾但未做到或未驗證**

- README 的「Linux」支援：Linux 與 WSL2 從未執行（B 組）。
- README 的 `pnpm demo`：本次未能實測（連接埠固定）；等價的 demo 模式伺服器可正常運作。
- 「Codex 觀察」：只有合成 rollout 與唯讀檔案讀取的帳本自述，沒有真實 session 的端到端畫面。
- 「手機」：沒有任何真機驗證（見第 10 節）。

**能用但文件沒寫**：設定頁的 `/` 搜尋與 `/settings/<group>` 深連結（features.md 有提）；Alt+拖曳換座位；Shift 多選；Ctrl／Cmd+K 快速開啟；`?preview=life` 與 `?intro=force` 除錯網址（文件有，但屬維護者工具）；自動採用 repo 為專案時略過 `/tmp`（文件未提，會讓在暫存目錄試用的人困惑）。

**建議在開源前隱藏或移除**：A2A 閘道與 ACP 用戶端；GitHub／Linear 連接器；「邀請遠端執行主機」（需自行架 HTTPS，REM-01 自述未測真實 TLS）；訊息的房間／會議／檔案預約；版面編輯器（或標實驗性）；以及倉庫根目錄下未追蹤的 `scripts/_audit-server.ts`（維護者工作檔，此為觀察，未動它）。

## 9. 本次評估的副作用與邊界（揭露）

- 只使用連接埠 4641 與 4642；只結束我自己啟動的行程。（曾有一次 `pkill -n` 範圍過大的風險，事後確認 4310 的維護者伺服器行程未受影響。）
- 在我的 fixture 原生伺服器第一次啟動的約 4 分鐘內，它沒有隔離 `AETHER_CLAUDE_USAGE_FILE` 與 `AETHER_CODEX_HOME`，所以頂部列曾顯示本機 Claude 的真實額度百分比，模型目錄也呼叫了真實的 `codex debug models`。我沒有讀取任何檔案內容；之後已改為隔離。`shots/N2*`、`N5*`、`N9*` 這三張截圖含該百分比，留在暫存區，請勿發布。
- 我執行 `pnpm hooks install --remote-approvals` 時，它依設計把 `approval-config.mjs` 與 `hook-approval.mjs` 複製到維護者的真實 `~/.aether/hooks/`（內容取自乾淨 clone 的 HEAD，與倉庫腳本相同）。這些檔案若原本就存在，已被覆寫為較新版本；我沒有刪除它們，以免破壞維護者已安裝的核准 hook。
- 未提交任何東西；除本文件外沒有修改倉庫。

## 10. 無法驗證的項目

真實 Claude Code／Codex 的互動（Composer 對真實提示、真實 resume、真實 `SubagentStart` 序列、真實付費工作流程）；真實 GitHub／Linear 憑證；真實 ACP 轉接器的 prompt turn；Linux、WSL2、Windows；
Safari、iOS、Android 真機（觸控手勢、安裝為 App、通知、PWA 離線殼；純 HTTP 區網上本來就不提供）；低階 GPU 與手機 GPU 的幀率與 VRAM；螢幕閱讀器（VoiceOver、NVDA）；
冷快取安裝；經 HTTPS 反向代理與 Tailscale 的遠端使用；24 小時以上閒置程序的「下班」流程（e2e 以合成方式涵蓋）；停止 session 的最後一步確認（我的自動化未能點到選單項，未重試）；
多使用者與多機器（產品本來就不支援）。

## 11. 各區上線準備度

判定：**出貨**、**實驗性標籤**、**隱藏**、**砍掉**。

| 區                               | 判定         | 理由與前置條件                                                                       |
| -------------------------------- | ------------ | ------------------------------------------------------------------------------------ |
| 3D 辦公室、鏡頭                  | 出貨         | 核心；v1 前補 skip link 與 canvas 名稱，並在 README 寫明只在 M4 驗過                 |
| Feed 與對話                      | 出貨         | 最成熟的區塊；XSS 與密鑰遮蔽實測通過                                                 |
| KPI                              | 出貨         | 先修 D09（靜默 0）                                                                   |
| 角色分類                         | 出貨，附說明 | 在介面標明「由訊號推測，附信心與證據」；README 不要宣稱準確率                        |
| 小隊／subagent                   | 出貨         | Claude hooks 與 transcript 路徑可靠；Codex 子代理資訊較少，文件已說                  |
| 配對 QR／LAN／PWA                | 出貨         | 實測順暢；純 HTTP 的限制已誠實揭露                                                   |
| 遠端核准                         | 實驗性標籤   | 端到端可行但 opt-in、僅 Claude Code、未對真實 CLI 驗證（OBS-APPROVAL-01）；先修 D05  |
| 設定頁                           | 出貨         | 修 D12、D15                                                                          |
| 下班／停止／回收                 | 出貨         | 破壞性操作有再確認與 SIGTERM 後 SIGKILL；我未能親測最後一步，v1 前請維護者手動跑一次 |
| Composer 與終端連結              | 實驗性標籤   | 只對假 TUI 驗證；真實 Claude／Codex 提示輸入未跑                                     |
| 終端機頁（PTY）                  | 實驗性標籤   | 僅 macOS；Linux 未驗                                                                 |
| 版面編輯器                       | 實驗性標籤   | D19                                                                                  |
| 辦公室小動畫、桌面螢幕、開場導覽 | 出貨         | 裝飾性、可關；修 D11                                                                 |
| 角色造型                         | 出貨         | 資產與授權屬另案                                                                     |
| 模型目錄                         | 出貨         | 修 D15 文字                                                                          |
| 診斷與 hooks CLI                 | 出貨         | 修 D10；hooks 指令實測可靠                                                           |
| 安裝與首次使用                   | **阻擋 v1**  | D01、D02、D03 必修                                                                   |
| 歷史與回放                       | 出貨         | 回放僅事件清單，文件已說                                                             |
| 手機介面                         | 出貨，附說明 | 修 D06、D07、D18；真機未測，README 要寫                                              |
| 工作台：任務／DAG／審查          | 實驗性標籤   | demo provider 可跑通；真實 provider 未驗；保留在 Advanced 後                         |
| 工作台：Runner／原生執行         | 實驗性標籤   | 會花錢、動檔案；僅 macOS                                                             |
| 知識／Skills／排程               | 實驗性標籤   | 功能完整、價值不明確                                                                 |
| 訊息／房間／會議／預約           | 隱藏         | 與「觀察 CLI」的主訴求無關，維護成本高                                               |
| A2A／ACP／MCP                    | 隱藏         | 預設關閉，沒有真實驗證                                                               |
| GitHub／Linear 整合              | 隱藏         | 無真實憑證驗證；不能開 PR、不回寫                                                    |
| 邀請遠端執行主機                 | 隱藏         | 需自行 TLS，未測                                                                     |

## 12. 建議的 v1 範圍切線

**線內（v1 的承諾）**：觀察 Claude Code 與 Codex session（唯讀）；3D 辦公室與 2D 清單；feed 與對話；token 與 Git KPI；角色／樓層分類（附證據）；小隊與 subagent；配對手機與 PWA；設定；下班與停止；模型目錄；hooks 與 doctor；歷史。再加兩項標「實驗性」的選配：遠端核准（Claude only）、Composer／終端（需 runner）。

**線外（隱藏於 Advanced 之後並標實驗性，或延後）**：整個工作台——任務、審查、runner 原生執行、知識、skills、排程；版面編輯器。

**線外（建議隱藏或砍掉）**：訊息／房間／會議／預約；A2A、ACP、MCP；GitHub、Linear；遠端機器邀請；外部觀察（`observe` provider）。

**理由**：

1. 觀察者核心是唯一在乾淨環境、不需付費模型就能完整驗證的部分，且品質明顯高於其餘。
2. 工作台的價值取決於真實 CLI 在隔離 worktree 工作，而這一點在帳本與本次實測中都沒有端到端證據；把它放進 v1 承諾會把「未驗證」變成使用者的風險。
3. 隱藏的區塊仍有大量程式與測試，不刪除也能降低對外暴露；`Advanced` 開關已經是現成機制，只需更改預設文案為「實驗性」。
4. v1 前最划算的 5 件事：D01、D02、D03、D04、D05（皆為 S 級工作量），其次 D06、D07、D09、D10。完成後整體平均可從 2.8 提升到約 3.1，且「首次使用」從 2.0 提升到 3.0 以上。
