# 用量讀取稽核（token / usage / context / limits / git KPI）

[文件索引](../README.md) · [專案首頁](../../README.zh-TW.md)

> [!NOTE]
> 此文件為當時版本的設計與研究紀錄；提案、量測及實作觀察不代表目前版本的支援狀態。
> 現行操作方式與驗證結果，請以操作指南及功能驗證台帳為準。

<details>
<summary>目錄</summary>

- [結論先講](#結論先講)
- [1. 發現清單（依嚴重度）](#1-發現清單依嚴重度)
- [2. 效能與規模（本機量測，只有數字）](#2-效能與規模本機量測只有數字)
- [3. 獨立重算 vs AETHER 函式](#3-獨立重算-vs-aether-函式)
- [4. 各主題結論（對照你列的 8 點）](#4-各主題結論對照你列的-8-點)
- [5. 隱私](#5-隱私)
- [6. 建議新增的回歸測試](#6-建議新增的回歸測試)
- [7. 無法驗證的項目](#7-無法驗證的項目)
- [附：量測用腳本](#附量測用腳本)

</details>

日期：2026-10-07。性質：唯讀稽核，只讀程式碼與本機真實資料（只取數字，不輸出任何文字、id、路徑）。分支 `aether/product`，未改任何追蹤檔。

## 結論先講

核心計數（Claude / Codex 的 token 加總）在本機真實資料上是準的：獨立重算與 AETHER 函式逐檔比對，Claude 1470 個檔案零差異，Codex 2308 個檔案 2299 個零差異，其餘 9 個差異皆為預期語意（見第 3 節）。**問題不在算術，在「歸屬、上限、標示、情境量表」**：

1. 辦公室（部門）分頁只涵蓋最新約 60 個 session，約八成以上的 30 天 token 落在網頁從不顯示的 `unplaced`。
2. Claude context 量表的分母是猜的（沒有 `[1m]` 字尾就以 200k 起算，超過 200k 才翻成 1M），分數會在 200k 處跳動。
3. 最後一筆 assistant 是 `<synthetic>` 時，context 顯示 0% 且模型叫 `<synthetic>`。
4. 3775 / 4000 檔案上限已用 94%，超過會靜默少算，且 `scan.complete` 仍為 true。
5. 「Active time」是 session 分鐘加總，30 天顯示 1019.6 小時，超過 720 小時的牆鐘時間，卻沒有標明。

信心標記：**已驗證**（跑過真實資料或測試）、**程式碼已讀**（從程式推論、未用資料驗證）、**推測**。

## 1. 發現清單（依嚴重度）

| id   | 區域            | 證據（file:line）                                                                                                                     | 判定                             | 影響                                                                                                                                                                                                                                                                                                                                                        | 最小修正                                                                                                                                                                                    |
| ---- | --------------- | ------------------------------------------------------------------------------------------------------------------------------------- | -------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| U-01 | 歸屬 / 誠實     | `local-sessions.ts:35,171-175`；`usage-aggregate.ts:126-130`；`usage-compat.ts:44`（web 全站只在此提到 `unplaced`，沒有任何畫面顯示） | 已驗證（程式）／量級為估計       | 只有「執行中 + 最新 60 個」session 有部門；其餘進 `unplaced`。以最新 60 session 當代理估算，30 天 token 的 83.8% 在 `unplaced`。各辦公室加總遠小於大樓總數，畫面沒有說明                                                                                                                                                                                    | 顯示 `unplaced` 一格；或辦公室分頁標「僅近期 session」；或用 transcript 的 cwd 直接分類而不依賴 session 清單                                                                                |
| U-02 | context 分母    | `session-context.ts:27-41`；`packages/providers/src/models.ts:110-118`                                                                | 可能的錯誤（無法驗證實際視窗）   | 真實 transcript 的 model 皆無 `[1m]` 字尾（claude-opus-5-5 等），目錄裡的 `…[1m]` id 對不上，故 Claude 一律 200k，直到 tokens 超過 200k 才改 1M。近 14 天 852 個主 session 中 188 個 >200k（抽樣中最大 808,290，證明 1M 存在），664 個 ≤200k 以 200k 計，51 個顯示 ≥90%。1M 工作階段在 200k 以下被放大 5 倍；跨 200k 時百分比由約 100% 掉到約 20%（非單調） | 畫面標明「視窗為推定」；無證據時回 `null` 或附 `assumed: true`；若 CLI 在別處（settings / 狀態列）記錄 `context_window` 就改讀它                                                            |
| U-03 | context         | `session-usage.ts:84-97`（Claude 分支不排除 `<synthetic>` 與 `isApiErrorMessage`）                                                    | 已驗證的錯誤                     | 最後一筆 assistant 為 synthetic 時：contextTokens=0、model=`<synthetic>`、contextPct=0（未知被當成 0%）。近 14 天 854 個主 session 中 4 個命中。API 錯誤剛好是使用者最想看量表的時刻                                                                                                                                                                        | 跳過 model 以 `<` 開頭、或 usage 全 0 的列，繼續往前找上一筆；仍找不到才回 `null`                                                                                                           |
| U-04 | 上限 / 完整性   | `usage-store.ts:11`；`usage-files.ts:8,52,54,100`；`usage-stats.ts:209`                                                               | 已驗證（量測）＋程式碼已讀       | 本機 31 天窗內 3775 個檔案，上限 4000（94.4%）。超過時依 mtime 靜默丟最舊的檔，而 `scan.complete` 仍是 true、沒有「被截斷」旗標。另 `MAX_ENTRIES=24576` 對 Claude 以專案資料夾名稱倒序走訪，額度用完丟的是「字母較前的專案」而非最舊的                                                                                                                      | 回傳 `scan.truncated`（listing 超過 maxFiles 或 entries 預算耗盡）並在 UI 顯示；Claude 目錄改以 mtime 排序後再走訪；上限放寬到 16k 並實測                                                   |
| U-05 | 標示            | `KpiScopeView.tsx:72`；`usage-parse.ts:76-81`；`usage-aggregate.ts:41`                                                                | 已驗證（量測）                   | 「Active time」= 各 session 分鐘相加；並行 session、subagent 會重複計。30 天 61,177 分鐘 = 1019.6 小時 > 720 小時。契約註解寫了 session-minutes，畫面標籤沒有                                                                                                                                                                                               | 標籤改「Session 時間」；或另提供去重後的牆鐘（區間聯集）                                                                                                                                    |
| U-06 | 可觀測性        | `usage-stats.ts:128-130,150-152`；`usage-files.ts:95-97`；`usage-parse.ts:133`                                                        | 設計風險                         | 讀不到的檔、無法解析 id/時間戳的列都被靜默略過，回應沒有錯誤計數，`complete: true` 仍成立。若 Claude 改欄位順序（現況 id 偏移最大約 209 位元組，視窗 900，餘裕夠），會無聲少算                                                                                                                                                                              | `metrics` 加 `failedFiles`、`skippedLines`，進 `scan`；測試固定                                                                                                                             |
| U-07 | 隱私 / 護欄     | `tests/aether/classify-session.test.ts:288-299`                                                                                       | 已驗證（缺口）                   | 「不得 import 網路 / child_process / SDK」的靜態護欄 `ENTRY` 只列分類器的 4 個模組，**不含**任何用量模組。目前這些模組實際乾淨（已 grep），但沒有測試保證；且只檢 `from '…'`，不檢動態 `import()`                                                                                                                                                           | 新增同型測試涵蓋 `usage-*.ts`、`session-usage.ts`、`session-context.ts`、`claude-limits.ts`、`codex-limits.ts`、`subagent-usage.ts`；`git-kpi.ts` 因經由 `git-health.ts` 呼叫 git，需白名單 |
| U-08 | 限額新鮮度      | `KpiLimits.tsx:50`；`codex-limits.ts:10,22`；`claude-limits.ts:14,30`；`ClaudeQuota.tsx:14`                                           | 設計風險                         | Claude 額度來自第三方外掛 claude-hud 的快取（`STALE_MS`=15 分鐘）；環圈本身不標年齡，只在段落底部加一句「過期」。Codex 額度沒有 stale 旗標、也不顯示 `updatedAt`（取最新 4 份 rollout 的尾端，閒置機器可能是數日前，只靠「重置時間已過就丟棄」兜底）。頂欄時間寫死 Asia/Taipei，儀表板用機器時區。本機當下快取只有 50 秒，健康                              | 每個環圈顯示讀數年齡；Codex 也加 `stale`；時區統一取 `usage.timezone`                                                                                                                       |
| U-09 | 重複計數        | `usage-parse.ts:140`；`usage-aggregate.ts:133-139`                                                                                    | 設計風險（現況影響小）           | Claude 只對「相鄰行」同 id 去重。實測：單檔內非相鄰重複 0；跨檔重複 id 36 個；若把 AETHER 的做法與全域唯一 id 比較，30 天窗多算 fresh 0.28%、cache read 0.03%。resume / fork 若日後開始複製歷史，影響會放大                                                                                                                                                 | 狀態保留最近 N 個 id（環形）處理非相鄰重複；跨檔以 `(sessionId,messageId)` 在 aggregate 前去重或至少量測並顯示                                                                              |
| U-10 | Session 數      | `usage-files.ts:21-28`                                                                                                                | 設計風險                         | Claude subagent 檔併入父 session；Codex 子代理（本機 31 天內 267 個 rollout）各自成為獨立 session。「Sessions 3060」= Claude 892 + Codex 2168，語意不一致                                                                                                                                                                                                   | 依 `session_meta.source.subagent` 併入父 session，或標籤改「transcript 數」                                                                                                                 |
| U-11 | 兩套解析器      | `session-usage.ts:146-165` 對 `usage-parse.ts:120-168`                                                                                | 設計風險（SSOT 漂移）            | `sumClaudeTokens` 是 `parseClaude` 的複本：視窗 400 對 700 位元組、無 `\|\|=` 後備。目前 3 個小檔 + 2 個大檔結果一致，但 session 清單的 `freshTokens`（整個 session 生命）與 KPI（逐日）兩條路徑隨時可能分歧                                                                                                                                                | `freshTokens` 改由 `usage-parse` 的 `fresh()` 累計，刪除 `sumClaudeTokens`                                                                                                                  |
| U-12 | 辦公室 fallback | `KpiScopeView.tsx:48-51`                                                                                                              | 程式碼已讀                       | 找不到該樓層時退回 `usage.building`，大樓總數會以某辦公室的標題顯示                                                                                                                                                                                                                                                                                         | 找不到就顯示空狀態                                                                                                                                                                          |
| U-13 | 佔比分母        | `kpi-model.ts:47-50`；`usage-aggregate.ts:16`                                                                                         | 已驗證（量測）                   | 模型佔比的分母是「顯示的 ≤12 個模型」的加總，不是總量（30 天窗 `models` 加總 ≠ fresh 總量）。另有 `unknown` 模型佔 3.16%（推測為 Codex 在第一個 turn_context 之前的事件，未驗證）                                                                                                                                                                           | 分母用 scope 總量；`unknown` 標成「未記錄」                                                                                                                                                 |
| U-14 | git KPI         | `git-kpi.ts:12-13,136-149`；`routes/usage.ts:18,60,72-74`                                                                             | 程式碼已讀（未用真實 repo 驗證） | `--shortstat` 只看 2000 筆提交、提交清單上限 5000，皆靜默截斷但契約寫「最近 30 天」；`MAX_REPOS=12` 讓大樓總數靜默漏掉第 13 個起的專案；作者以 `%an` 計（同人不同名會雙算）；rebase/cherry-pick 的提交算兩次；git 路由每次重取時區，usage 在建構時固定一次（機器時區改變時兩者分歧）                                                                        | 截斷時回 `null` 或加 `truncated` 旗標；作者改用 `%ae`                                                                                                                                       |
| U-15 | 快取正確性      | `usage-stats.ts:63-79,118-121`                                                                                                        | 設計風險（低）                   | 以前 256 位元組雜湊 + `offset <= size` 判斷「追加或重寫」。同 head、較大尺寸的原地重寫，或截斷後在兩次掃描間又長回超過舊 offset，會被當成追加而數字過期。Claude / Codex 皆為只追加，實務罕見                                                                                                                                                                | 簽章加上 offset 前一小段尾端位元組的雜湊                                                                                                                                                    |
| U-16 | 歷史耐久性      | `usage-stats.ts:133-139`                                                                                                              | 設計風險（低）                   | 檔案消失（被 CLI 清理）或離開 31 天窗即從 rollup 刪除，窗內舊日的數字會事後下降。本機最舊 Claude transcript 為 2026-04-01，目前沒被清                                                                                                                                                                                                                       | 文件註明；若要保留，逐日小計另存                                                                                                                                                            |
| U-17 | requests 計數   | `usage-parse.ts:164`                                                                                                                  | 已驗證（量小）                   | `<synthetic>` 列（31 天窗 103 筆，皆零 token）仍計為 request                                                                                                                                                                                                                                                                                                | 命中 `<` 開頭模型時不加 `req`                                                                                                                                                               |
| U-18 | 預設值          | `usage-compat.ts:41`                                                                                                                  | 程式碼已讀                       | 舊伺服器缺 `scan` 時預設 `complete: true`，把「未知」當「完整」                                                                                                                                                                                                                                                                                             | 預設 `complete: false`                                                                                                                                                                      |
| U-19 | 校準腳本        | `scripts/beam-calibration.ts:21,111-113`                                                                                              | 設計風險（低）                   | 100 MB 以上的檔直接略過（本機有一份 Codex rollout 超過 300 MB），分佈偏向小 session；Codex 只取檔名排序最後 300 份。腳本沿用 app 解析器，故繼承 U-09 以外的全部行為                                                                                                                                                                                         | 輸出附「略過檔數」                                                                                                                                                                          |
| U-20 | context 與壓縮  | `session-usage.ts:46-106`；`session-context.ts:75-92`                                                                                 | 程式碼已讀（未驗證）             | context 取自「尾端最後一筆 assistant」。壓縮標記寫入後、下一筆 assistant 出現前，量表仍是壓縮前數字；前端以 `compactedAt` 補，但量表本身短暫過時                                                                                                                                                                                                            | 若標記時間晚於最後 assistant，量表標「壓縮中」                                                                                                                                              |

### 明確評為「沒問題」的項目

| 項目                        | 證據                                                                                                           | 備註                                                                                                                                                |
| --------------------------- | -------------------------------------------------------------------------------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------- |
| cache read / write 分類     | `usage-parse.ts:98-111,183-194`；實測 4 類逐檔與獨立重算 0%                                                    | cache read 不併入 input；headline 排除 cache read 並有說明文字（`KpiDashboard.tsx:123`）                                                            |
| Codex 累計 vs 單次          | `usage-parse.ts:210-225`                                                                                       | 以 `total` 差分；重複事件加 0；總量下降時改用 `last`；首筆用 `last`。實測 5 份「首筆 total 含繼承歷史」的 rollout 正確不重算（共 5.9M fresh token） |
| Codex fork / 子代理複製歷史 | 實測 126 份 fork、267 份子代理 rollout                                                                         | 未發現被複製的 token_count 事件（時間戳早於 session_meta 者 0 筆）                                                                                  |
| Claude subagent / sidechain | `usage-files.ts:6-7`                                                                                           | subagent 檔有掃；主檔內 `isSidechain` 行 0 筆                                                                                                       |
| 串流重複行                  | `usage-parse.ts:140-162`                                                                                       | 31 天窗 192,943 行 usage 對 102,499 個唯一 id，相鄰去重取最大值                                                                                     |
| 時區 / 日界                 | `usage-parse.ts:291-309`；rollup 記錄 `tz`（`usage-store.ts:48`）；週 / 月起始日不存在（範圍是滾動 1/7/30 天） | 本機 Asia/Taipei，無夏令時間；測試 `usage-parse.test.ts:82`                                                                                         |
| 費用                        | `usage-aggregate.ts:200`、`contracts/usage.ts:cost: z.null()`、`KpiDashboard.tsx:123`                          | 完全不算金額，畫面明講「沒有價格表，不估算」。日後加費用要分 5m/1h 快取（實測 100% 的列有 1h 快取欄）、`speed`、長上下文分級                        |
| 增量讀取                    | `usage-stats.ts:81-99`、測試 `usage-stats.test.ts:50-100`                                                      | 只讀整行；半行等下次；重啟不重讀（量測 0 位元組）                                                                                                   |
| 隱私                        | 見第 5 節                                                                                                      |                                                                                                                                                     |

## 2. 效能與規模（本機量測，只有數字）

| 項目                      | 數值                                                                                                            |
| ------------------------- | --------------------------------------------------------------------------------------------------------------- |
| 31 天窗內 transcript 檔案 | 3775（Claude 1470 含 subagent 566；Codex 2308；清單 3775 因窗界差 3 個）                                        |
| 位元組                    | Claude 2.80 GB、Codex 5.17 GB，共約 7.97 GB（`~/.claude/projects` 全量 2.9 GB、`~/.codex/sessions` 全量 12 GB） |
| 冷掃（OS 快取已暖）       | 12.2 秒，讀 8.48 GB，1 次 pass，RSS 166 MB                                                                      |
| 暖掃（無變動）            | 76 ms；再算兩個範圍的聚合 22 ms；RSS 178 MB                                                                     |
| rollup 檔                 | 1.62 MB；重啟後 79 ms、讀 0 位元組                                                                              |
| 工作負載                  | 客戶端每 30 秒（掃描中 4 秒）一次；暖 pass 約 76 ms，間隔 `min(3000, 耗時×10)` ≈ 0.76 秒，占空比約 0.25%        |

- **10 倍檔案**：列舉與 stat 約 10 倍（暖 pass 約 0.8 秒，間隔上限 3 秒），冷掃約 2 分鐘（背景、每 1 MB 讓出事件迴圈）；rollup 約 16 MB，每 30 秒同步 `JSON.stringify` 一次。但在到達之前先撞 U-04 的 4000 檔上限。記憶體每檔常駐一個 `ParseState`，量測 +12 MB / 3775 檔，線性。
- 每次 `/api/usage` 還會跑 `scanLocalSessions`（`routes/usage.ts:38-39,48`），這條路徑未量測，可能比 usage 本身重。
- 真正冷磁碟的冷掃時間未量測（無法清 OS 快取）。

## 3. 獨立重算 vs AETHER 函式

方法：以 `JSON.parse` 逐行重算，Claude 依 `message.id` 取各欄最大值後加總；Codex 取最終 `total_token_usage`，並另以「`total` 有變動才加 `last_token_usage`」交叉驗證。AETHER 側呼叫 `parseChunk`（KPI）與 `sumClaudeTokens` / `parseUsage`（session 清單）。檔案只標代號與大小。

### 3.1 逐檔（Claude；單位 token，差異為 AETHER 相對獨立值的百分比）

| 檔  | 大小    | 唯一訊息 | input（獨立 / 差異） | output         | cache read         | cache write     | requests | session 清單 `freshTokens` | context（獨立 = AETHER） |
| --- | ------- | -------- | -------------------- | -------------- | ------------------ | --------------- | -------- | -------------------------- | ------------------------ |
| C1  | 3.2 MB  | 164      | 328 / 0%             | 138,557 / 0%   | 45,348,839 / 0%    | 467,177 / 0%    | 0%       | 0%                         | 477,158                  |
| C2  | 1.3 MB  | 42       | 84 / 0%              | 67,952 / 0%    | 4,921,375 / 0%     | 227,904 / 0%    | 0%       | 0%                         | 227,906                  |
| C3  | 1.1 MB  | 57       | 114 / 0%             | 46,055 / 0%    | 6,772,450 / 0%     | 152,363 / 0%    | 0%       | 0%                         | 162,325                  |
| C4  | 195 MB  | 14,067   | 36,890 / 0%          | 7,900,470 / 0% | 7,458,764,239 / 0% | 25,731,190 / 0% | 0%       | 0%                         | 808,290                  |
| C5  | 36.4 MB | 159      | 352 / 0%             | 119,443 / 0%   | 45,014,589 / 0%    | 2,734,277 / 0%  | 0%       | 0%                         | 441,707                  |

C4 含 28 筆 `<synthetic>` 列，C4 的 `requests` 仍等於唯一訊息數（因這些列的 id 亦計入唯一訊息，與 U-17 一致）。

### 3.2 逐檔（Codex；差異相對最終 total）

| 檔  | 大小    | token_count 事件 | 重複 total | input（獨立 / 差異） | output       | cache read       | reasoning    | requests（AETHER / 事件 − 重複） | context（獨立 = AETHER） | 視窗              |
| --- | ------- | ---------------- | ---------- | -------------------- | ------------ | ---------------- | ------------ | -------------------------------- | ------------------------ | ----------------- |
| X1  | 1.3 MB  | 19               | 0          | 94,796 / 0%          | 6,731 / 0%   | 1,508,864 / 0%   | 2,047 / 0%   | 19 / 19                          | 117,994                  | 490,200 = 490,200 |
| X2  | 2.0 MB  | 20               | 0          | 154,644 / 0%         | 9,492 / 0%   | 1,939,840 / 0%   | 2,869 / 0%   | 20 / 20                          | 151,608                  | 490,200 = 490,200 |
| X3  | 2.2 MB  | 18               | 0          | 169,796 / 0%         | 4,338 / 0%   | 1,738,624 / 0%   | 3,101 / 0%   | 18 / 18                          | 166,845                  | 490,200 = 490,200 |
| X4  | 86.9 MB | 298              | 26         | 1,013,892 / 0%       | 74,498 / 0%  | 57,600,256 / 0%  | 182,653 / 0% | 272 / 272                        | 98,522                   | 490,200 = 490,200 |
| X5  | 34.1 MB | 57               | 1          | 138,330 / 0%         | 11,126 / 0%  | 6,365,184 / 0%   | 12,351 / 0%  | 56 / 56                          | 146,026                  | 490,200 = 490,200 |
| X6  | 30.2 MB | 1,425            | 45         | 3,059,262 / 0%       | 293,443 / 0% | 238,488,064 / 0% | 460,663 / 0% | 1,380 / 1,380                    | 123,228                  | 490,200 = 490,200 |

X1 至 X3 的 session 清單 `freshTokens` 分別為 103,574、167,005、177,235，等於 input + output + reasoning（無 cache read），與 KPI 路徑一致。

說明：挑檔器的「中位」與「最後」在大檔組只有兩個候選，C2 與 C3 實為同一檔，故大檔組 Claude 是 2 個相異檔（C4、C5），小檔組 3 個，合計 5 個相異 Claude 檔、6 個相異 Codex 檔。

### 3.3 全量（31 天窗，全部檔案）

| 提供者 | 檔案數 | 有差異的檔 | 獨立（fresh） | AETHER（fresh） | 差異   | 最差單檔 | 差異原因                                                                                                                                                                                 |
| ------ | ------ | ---------- | ------------- | --------------- | ------ | -------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Claude | 1470   | 0          | 481,903,766   | 481,903,766     | 0%     | 0%       | cache read 同樣 0%（29,097,081,252）                                                                                                                                                     |
| Codex  | 2308   | 9          | 421,034,596   | 422,399,389     | +0.32% | 130.4%   | 4 檔 total 中途下降（AETHER 對下降後的新請求另計，獨立法「看最終 total」低估）；5 檔首筆 total 含繼承歷史（AETHER 正確排除，獨立法把它算進去）。兩者皆為獨立法的缺陷，不是 AETHER 的錯誤 |

另有一份超過 300 MB 的 Codex rollout 在全量比對時因字串長度限制被略過（只影響獨立重算那一側）。

## 4. 各主題結論（對照你列的 8 點）

1. **重複計數**：單檔內已驗證無（見 3.3）。跨檔 36 個 id 重複，量級 0.28%（U-09）。Codex 累計與單次處理正確。同一 session 不會落入兩個視窗（逐日分桶，檔案只屬一個 session）。
2. **漏算**：cache 類別沒有被併入 input。subagent 檔與 Codex 子代理都有掃。缺口是 U-04（檔數與目錄預算上限）、U-16（被清理的 transcript）、U-01（歸屬）、窗外與未來時間戳靜默丟棄（`usage-aggregate.ts:134-135`，量小）。
3. **費用**：不計算，標示正確。
4. **context 量表**：分子 = 最後一筆 assistant 的 `input + cache_creation + cache_read`，不是加總，這是對的；Codex 用 `last_token_usage.input_tokens` 與事件自帶的 `model_context_window`，正確。分母見 U-02；未知模型且無觀測值時 `contextPct` 回 `null`（`session-context.ts:35-46`），但 U-03 例外。
5. **新鮮度 / 效能**：見第 2 節與 U-15、U-16。
6. **UI 誠實度**：U-01、U-05、U-08、U-12、U-13、U-18。未知回 `null` 後前端多數顯示「—」，已有 `kpiNoTokens`、`kpiScanning`、「沒有價格表」等說明；環圈缺年齡。
7. **隱私**：見下。
8. **真實資料交叉驗證**：見第 3 節。

## 5. 隱私

- **不保留文字**：已驗證。`usage-parse.ts` 只在記憶體解碼每行前 900 位元組、counter 後 700 位元組，用 regex 取出 id、model、數字，不保存也不回傳；Codex 只對 `token_count` 行做 `JSON.parse`；`session-usage.ts` 會對含 `"usage"` 的整行 `JSON.parse`（其中包含 assistant 文字），但只讀數字並丟棄。
- **不記錄日誌**：已驗證。用量相關模組與路由無 `console.*` / logger；唯一可見的是 Fastify 預設請求日誌（只有 `range` 查詢參數）。
- **落地資料**：rollup 以路徑 sha1 前 16 碼為鍵，模式 0600，內容是數字、模型名與**專案資料夾名稱**（`Entry.repo`），並非嚴格的「只有數字」；回應也含專案資料夾名稱。路由限擁有者 / 操作員（`requireOperator`）。`redaction.ts` 不在此路徑，因無文字可遮。
- **靜態 import 護欄**：**沒有涵蓋用量模組**（U-07）；現況乾淨是靠人，不是靠測試。
- 錯誤被靜默吞掉（U-06）在隱私面是好事、在可觀測性面是缺點。

## 6. 建議新增的回歸測試

| 測試名稱                                                                         | 檔案                          | 固定的行為                                                                                                                                                                     |
| -------------------------------------------------------------------------------- | ----------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| `skips synthetic and api-error rows when reading context`                        | `session-usage.test.ts`       | U-03：最後一筆是 `<synthetic>` 時，context 與 model 取上一筆真實 assistant；全無則為 `null`、不是 0                                                                            |
| `does not count a synthetic row as a request`                                    | `usage-parse.test.ts`         | U-17                                                                                                                                                                           |
| `counts a message once when its lines are not adjacent`                          | `usage-parse.test.ts`         | U-09：id A、B、A 交錯時 A 只計一次                                                                                                                                             |
| `counts one message once across two copies of a transcript`                      | `usage-stats.test.ts`         | U-09 跨檔：兩個含相同 id 的檔案不重複                                                                                                                                          |
| `reports truncation when the file cap or entry budget is hit`                    | `usage-stats.test.ts`         | U-04：`scan.truncated`；並確認被丟的是最舊的而非字母順序                                                                                                                       |
| `lists claude projects newest first under a spent budget`                        | `usage-files` 相關測試        | U-04                                                                                                                                                                           |
| `reports unreadable files and skipped lines in scan`                             | `usage-stats.test.ts`         | U-06                                                                                                                                                                           |
| `a replaced file of the same size and head is read again`                        | `usage-stats.test.ts`         | U-15                                                                                                                                                                           |
| `offices plus unplaced equal the building total`                                 | `usage-aggregate` 測試        | U-01：不變量                                                                                                                                                                   |
| `the office view shows what is not placed`                                       | web 單元 / e2e                | U-01                                                                                                                                                                           |
| `window is assumed, not claimed, without a [1m] signal`                          | `session-context.test.ts`     | U-02：200k 以下的 Claude session 標示視窗為推定；跨 200k 不在無說明下改分母                                                                                                    |
| `a model with no window and no observation has no percent`                       | `session-context.test.ts`     | 固定現有的「未知是 null」行為                                                                                                                                                  |
| `usage modules import no network, process or SDK`                                | `classify-session.test.ts` 旁 | U-07：把 `usage-*.ts`、`session-usage.ts`、`session-context.ts`、`claude-limits.ts`、`codex-limits.ts`、`subagent-usage.ts` 加入護欄，含動態 `import()`；`git-kpi.ts` 走白名單 |
| `model shares are relative to the scope total`                                   | `kpi-model` 測試              | U-13                                                                                                                                                                           |
| `shows the age of each rate-limit ring and flags stale codex`                    | `KpiLimits` 元件測試          | U-08                                                                                                                                                                           |
| `an office floor that is missing shows empty, not the building`                  | `KpiScopeView` 元件測試       | U-12                                                                                                                                                                           |
| `a codex rollout whose first total carries history counts only its own requests` | `usage-parse.test.ts`         | 固定本次實測的正確行為（現有 `:144` 測試的真實資料形狀版）                                                                                                                     |
| `session list freshTokens equals the KPI parser on the same file`                | `session-usage.test.ts`       | U-11：兩條路徑一致，或刪除其中一條後的等價性                                                                                                                                   |

## 7. 無法驗證的項目

- Claude 的真實 context 視窗：本機沒有任何來源記錄實際視窗（transcript 的 model 無 `[1m]`），U-02 只能指出推論的弱點，不能指出哪個 session 實際是 1M。
- U-01 的 83.8% 是以「最新 60 個 session」為代理；實際歸屬還含執行中的 session 與專案分類，真實比例需實際跑 `scanLocalSessions`（會呼叫 git / 程序檢查，本次未執行）。
- 壓縮後量表的過時程度（U-20）：本機只有 4 個 session 尾端有壓縮標記，未逐一比對標記與最後 assistant 的先後。
- 36 個跨檔重複 id 的成因（resume、fork 或 subagent）未分類。
- git KPI 的數字未與真實 repo 重算（只讀程式）。
- 真正冷磁碟的掃描時間；`/api/usage` 完整請求（含 `scanLocalSessions`）的耗時；網頁實際畫面（未開瀏覽器）。
- claude-hud 快取數字本身的準確性（第三方外掛的輸出，只能驗證新鮮度為 50 秒、格式可解析）。
- `<synthetic>` 與 `isApiErrorMessage` 對 token 的實際貢獻：量測為 0，但無法證明所有版本皆如此。

## 附：量測用腳本

放在 session scratchpad（不入版控）：冷 / 暖掃計時、獨立重算（逐檔與全量）、跨檔重複、context 分佈、rollup 大小。全部只讀 `~/.claude` 與 `~/.codex`，只輸出數字。
