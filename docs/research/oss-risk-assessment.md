# 開源風險評估（2026-10-07）

範圍：授權合規已由 `docs/legal/*` 審過，這裡只複驗變動、並涵蓋其餘面向（機密與個資、安全姿態、隱私、品牌、社群與維運）。
唯讀評估：沒有改動儲存庫、沒有 push、沒有 commit。歷史掃描在拋棄式複本（`git clone --no-hardlinks`）上進行。

## 結論

**GO-WITH-CONDITIONS（有條件通過）。** 程式本身的安全與隱私姿態達到「陌生人可以安全試用」的水準；
真正擋住公開的是**歷史**（449 MB、含作者本機家目錄路徑的 `.blend` 歷史版本）與**兩個會讓第一天 CI 變紅的細節**。
這些都有現成工具與明確做法，約 1 至 2 個工作天可以清除。

## 一、複驗結果（授權部分只看變動）

| 檢查                                    | 結果                                                                                                                                  |
| --------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------- |
| `pnpm run notices:check`                | 通過：425 個鎖定套件、274 個隨附，通知文件為最新                                                                                      |
| `node scripts/oss/reuse-check.mjs`      | 通過：2298 個追蹤檔皆有授權紀錄                                                                                                       |
| `pnpm run oss:check`                    | **11 通過、3 警告、1 失敗**：失敗項是 gitleaks 掃描目前工作樹（見下，5 筆皆為測試用假 token）                                         |
| `oss:check --history`                   | 14 通過、7 警告、5 失敗：家目錄路徑（1 個測試檔 2 個版本、9 個 `.blend` 共 99 個版本）、歷史中有 Blender 檔                           |
| gitleaks 全歷史（複本，579 commits）    | 5 筆，皆為 `tests/aether/*.test.ts` 內的合成 `ghp_` 值（形狀為 `ghp_012…`、`ghp_abc…`、`ghp_TEST…`），未見真實機密                    |
| gitleaks 上游 remote（334 commits）     | 無發現                                                                                                                                |
| 乾淨目錄快速上手（`git archive` 複本）  | `pnpm install --frozen-lockfile`（離線，1.2 秒）、`pnpm build`（約 8 秒）、啟動（`PORT=4650`）皆成功；`/health` 回 ok、`localhost` 與偽造 Host 回 403 與文件一致；owner token 檔為 0600 |
| CI 指令本機驗證                         | `typecheck`、`lint`、`format:check`、`verification:check`、`check-bundle-size`（798 KB gzip）全數通過；`ci.yml` 可被解析，4 個 job，actions 皆以 SHA 固定 |
| 未驗證                                  | `pnpm test` 與 Playwright 未跑：測試使用固定埠 43xx（54 處引用），落在本次禁用埠段；`pnpm audit` 需要網路，未執行；Actions 無法在本機執行 |

## 二、機密與敏感資料

- **機密**：歷史中沒有真實機密。唯一的 gitleaks 發現是 5 個合成 `ghp_` 假值，來源是 2026-10-06 的三個新測試提交
  （`a2ae4c1f`、`28705f17`、`feeabf53`）。`.gitleaks.toml` 的 allowlist 只認舊的兩個假值，所以 `oss:check` 現在是紅的，
  發佈後 CI 的 `check` job 第一天就會失敗。修法：allowlist 加上這幾個前綴（或把 `tests/aether/` 這些檔案列為路徑例外）。
- **個資（家目錄路徑）**：`/Users/<user>` 出現在 `tests/aether/local-sessions.test.ts` 的 2 個歷史版本、
  `assets-source/animals/*.blend` 的 9 個檔案共約 99 個歷史版本。目前樹沒有（已 `.gitignore`）。歷史提交訊息沒有命中私人字串，
  但這項檢查依賴 `.oss-private-patterns`，該檔不存在於本機（只有 `.example`），所以只驗了內建通用規則；**需先建立該檔再重掃**（例如主機名 `Mac-mini`、帳號名、gmail 以外的私人地址）。
- **作者與信箱**：436 個維護者提交都用 `haotool <88911350+s123104@users.noreply.github.com>`（單一身分，`.mailmap` 已有，尚未換成 noreply）。
  上游作者（webdevcody、Shirone、muguetdev 等 9 位）的信箱是上游本來就公開的，不應改寫（計畫也不會）。
- **AI 共同作者與工作階段連結**：歷史中有約 189 個 `Co-Authored-By: Claude …` 行與 144 個 `claude.ai/code/session_…` 連結。
  `docs/release/history-cleanup.md` 寫「只有一個提交帶 Co-Authored-By」，**與事實不符**，需更正後再決定 `--drop-trailers`。
- **歷史體積**：`.git` 449 MB（pack 499 MB）；466 個提交；517 個舊版動物模型二進位。GitHub 單次 push 超過 100 MB 會警告，
  新使用者首次 clone 很慢。無 Git LFS 設定，也不建議為此引入。
- **分支、標籤、stash**：本機有 13 個 `worktree-agent-*` 分支與 1 個 stash（61 個檔案的 WIP），公開時不要推送；
  116 個 `v0.1.70`…`v0.1.206` 標籤是上游 agent-office 的歷史標籤，會與本專案 `0.4.0` 的版本敘事衝突，建議不要推送（只推 `main` 與新標籤）。
  上游 remote 另有約 90 個分支（`office/*` 等），不屬於本專案，不可 `--mirror`。
- **圖片（逐張以原尺寸檢視：`docs/images/` 14 張、`docs/research/.../evidence/` 2 張）**：全部是 demo 資料，
  專案名稱為 `harbor-web`、`ledger-api`、`data-pipeline` 等虛構名稱，畫面都標示 `DEMO`，沒有真實 prompt、路徑、token、人臉或真人頭像
  （角色是動物）。`connect-phone-desktop.jpg` 含一個 QR 與位址 `192.168.1.20:4511`：位址是範例值，QR 的一次性碼已過期（5 分鐘、單次有效），風險低，
  但建議重拍時用遮罩。兩張研究報告截圖是繁中的內部選型評估，無個資，但屬於內部決策文件，可考慮不隨公開 repo 出貨。
  手機截圖的「Needs you」標籤有文字重疊（外觀瑕疵）。
- **大檔與 GLB**：隨附 GLB 最大 2.05 MB（30 個，皆由 `tools/blender/build_animals.py` 程序化產生，出處見 `provenance.md`）；
  追蹤的 PNG 貼圖最大 0.6 MB。沒有第三方 3D 模型。`.research/`（2.9 GB 參考專案複本）、`.data/`、`.tools/` 皆被忽略且未追蹤；
  追蹤檔中沒有 vendored 第三方原始碼。工作樹有一個未追蹤的 `scripts/_audit-server.ts`（不是我建立的），公開前確認要不要保留。
- **提交訊息**：311 個維護者主旨超過 72 字（最長 502），60 個是 `Merge branch 'worktree-agent-…'`。這是品質問題而非洩漏，
  CI 的 `commit-messages` job 只檢查 PR，所以不會因歷史而紅。

## 三、安全姿態（給陌生人執行時）

設計審查 `docs/research/design-review.md` 的狀態（該文件沒有標註修復進度，下表是對照程式碼的結果）：

| 項目                    | 結論                                                                                                                         |
| ----------------------- | ---------------------------------------------------------------------------------------------------------------------------- |
| F07 反向代理失效        | **已修**：`AETHER_TRUST_PROXY`（預設關，只接受位址或 CIDR），`trustProxy` 已接線，文件已更新                                 |
| F24 LAN 明文 HTTP       | **部分**：cookie 在受信任代理終止 TLS 時為 `Secure`；文件誠實說明明文風險；**仍沒有 token 輪替指令**，LAN 模式仍接受原始 token 登入 |
| F25 `*.local` Host      | **未改**：`host-policy.ts` 仍在 LAN 模式接受任何 `*.local` 與 `localhost`（同埠）；屬 P3 縱深防禦                            |
| F26 公開路由無限流      | **已修**：webhook 每位址每分鐘 120 次，之後 429（`external.ts`）                                                             |

- **預設綁定**：`127.0.0.1`；`AETHER_HOST` 才開 LAN。已實測：`localhost` 與非預期 Host 回 403。這是對陌生人最重要的預設，做法正確。
- **Token**：owner token 檔 0600、不進 bundle、不進 URL；配對碼在 URL fragment、一次性、5 分鐘；遠端核准預設關閉，hook 回應有 HMAC 證明。
- **Runner 與指令執行**：runner 以自己的範圍 token 認證、不寫控制資料庫；README 與 `security.md` 明說「不是沙箱」，這個聲明是準確的。
- **MCP / A2A**：均為 opt-in；對外請求經 `safe-fetch`（阻擋私網與 metadata 位址、釘住連線、重驗轉址）。
- **供應鏈**：lockfile 以 `--frozen-lockfile` 驗證；`pnpm-workspace.yaml` 有 `minimumReleaseAge: 1440`、`trustPolicy: no-downgrade`、
  `blockExoticSubdeps`；`allowBuilds` 只放行 3 個原生套件；唯一 `postinstall` 是 `scripts/prepare-pty.mjs`；
  Actions 以 commit SHA 固定；Dependabot（npm 與 github-actions，每週，上限 5）已設定；SBOM（CycloneDX）有產生指令。
  `pnpm audit` 在 CI 是 `continue-on-error`，只報告不擋；本次無網路，結果未知。
- **SECURITY.md 的真實度**：只指向 GitHub Private Vulnerability Reporting，**沒有備用聯絡信箱**；
  「幾天內回覆」沒有數字、沒有修復時程承諾。對單人維護者來說這其實是誠實的，但若 PVR 沒有在第 0 天啟用，報告者就沒有任何管道。
  `publishing-checklist` 已列入啟用步驟，要真的勾掉。CODE_OF_CONDUCT 的檢舉管道也只有 GitHub 帳號。
- **其他觀察**：pino 預設日誌包含 `hostname`（例如 `Mac-mini.local`），使用者貼日誌到 issue 時會帶出主機名，建議在日誌設定中關閉或在 bug 範本提醒。

## 四、隱私

- **讀取什麼**：session 檔與處理程序表（唯讀）；逐字稿只在使用者打開該 session 時讀取，並過濾已知機密格式；hook 只記標籤（工具名、檔案基本名、指令第一個字），不記內容。
- **儲存什麼**：本機 `.data`（SQLite、token）、`~/.aether/`（hook 事件、核准設定，0600/0700）；瀏覽器端只有 CSRF token（sessionStorage / localStorage），Service Worker 不快取 `/api/`。
- **離開機器的流量**：我檢查了 web 原始碼與 `apps/web/dist` 的所有 URL 字面值、`fetch`、`EventSource`；沒有 WebSocket、`sendBeacon`、分析、字型 CDN 或地圖圖磚。
  bundle 內的外部網址只出現在函式庫字串（react.dev、reactflow.dev、opencollective.com 等），不會被請求。
  伺服端對外請求只有：opt-in 的 GitHub / Linear 連接器（`safe-fetch`）、opt-in 的 A2A、runner 到控制面（本機）。
  **README 的「無雲端、無遙測」宣稱與程式相符。** 需補一句：被觀察的 Claude / Codex CLI 與 runner 啟動的 Agent SDK 本身會連到各自的供應商，那是使用者自己的工具。
- **刪除與資料主體權利**：資料全在使用者自己的機器上，專案不是資料控制者；刪除資料 = 刪 `.data` 與 `~/.aether`。建議在 Data & privacy 設定頁與 README 寫成明確步驟（目前有 backup 指令，沒有「一鍵清除」）。
- **當機回報**：無，且文件已聲明。
- **README 與現實的小落差**：README 說「不會寫入 `~/.claude`」，但 `pnpm hooks install` 會修改 Claude 設定（文件另有說明且有備份）。建議在隱私段落加註「hook 安裝是唯一例外，且為 opt-in」。

## 五、法律與品牌（非法律意見）

- **「不隸屬」聲明**：README 結尾、`NOTICE`、Settings > About 皆有；但在 README 結尾而非開頭，建議在狀態提示旁加一行。
- **供應商標誌**：沿用 `docs/legal/trademarks.md` 的已知殘餘風險（簡化的 Claude 星芒與 Codex 結），維護者需決定「接受 / 換中性圖示 / 申請許可」。不重做授權審查。
- **專案名稱 AETHER OFFICE**：我做了三組搜尋，沒有找到同名「AETHER OFFICE」軟體產品，但「AETHER」是常見詞，
  - 英國商標公報有 AETHER 註冊，涵蓋第 9 與第 42 類（知識管理、資料視覺化軟體）：<https://www.ipo.gov.uk/types/tm/t-os/t-tmj/tm-journals/2025-038/UK00004244141.html>
  - GitHub 上已有同名系列的本機多代理專案 `macreat/aether`（Agent Engineering Workbench）：<https://github.com/macreat/aether>
  - 同類型的視覺化辦公室專案很多（agents-home、cube-pets-office 等），搜尋辨識度會被稀釋：<https://github.com/Litas-dev/agents-home>
  風險判斷：商標衝突為中低（描述性組合詞 + 非商用開源），但搜尋可發現性差、與 `macreat/aether` 易混淆。需在公開前做正式商標檢索（USPTO、TIPO、EUIPO）；改名在公開前幾乎零成本，公開後很貴。
- **素材**：動物模型與貼圖由專案腳本程序化產生；字體無外部載入；圖示是專案自製 `favicon.svg`。沒有發現未標註來源的素材。
- **CLA / DCO**：CONTRIBUTING 要求 `git commit -s`（DCO 精神）但 **CI 沒有檢查簽署**，屬宣稱大於強制；
  由於貢獻者授權採「MIT 進、MIT 出」，不需要 CLA，建議維持，並補上 DCO bot 或 CI 檢查，或把文字改成「建議」。
- **AI 輔助程式碼出處**：`licence-policy.md` 有「AI 輔助貢獻」章節，CONTRIBUTING 禁止貼入不相容授權的程式碼；
  但 README 沒有揭露此專案大量由 AI 協助撰寫（4 天內 436 個提交、189 個 Claude 共同作者行）。若清除 trailer，**必須在 README 或 `provenance.md` 補一段 AI 輔助聲明**，否則透明度反而下降。
- **第三方通知**：由鎖檔自動產生並在 CI 檢查，完整。Agent SDK 的專有條款已寫入（已審過，不重做）。

## 六、社群與維運成熟度

| 項目               | 現況                                                                                                                                                      |
| ------------------ | --------------------------------------------------------------------------------------------------------------------------------------------------------- |
| README             | 結構清楚（狀態、快速上手、截圖、限制、隱私），中英兩版；快速上手我照做可成功（需要 Node 24.21.0 精確版本，對陌生人門檻偏高但寫明了）                      |
| 平台               | 宣稱 macOS 與 Linux；驗證帳本承認 Linux、Windows 未實測（ENV-01、ENV-03、ENV-05）；CI 在 Ubuntu 跑完整檢查、macOS 只跑單元測試。**Linux 實機行為（ps、lsof 解析）是最大的未知** |
| 成熟度             | 175 項功能：145 已實作、30 部分；驗證 92 通過、83 部分、0 失敗；README 已標示 pre-release。誠實但「部分」比例高（47%）                                      |
| 版本               | 套件為 `0.4.0-dev.0`，CHANGELOG 已有 `[0.4.0]` 條目；檢查清單已寫明替換步驟，尚未執行                                                                       |
| Issue / PR 範本    | bug、feature、PR 範本、`config.yml`（關閉空白 issue、導向私下通報）齊備                                                                                    |
| CODEOWNERS         | `* @haotool`；單一擁有者 + 規則集要求 Code Owner 審查，檢查清單已提醒會自己無法核准自己的 PR                                                               |
| 缺少               | `SUPPORT.md`、`GOVERNANCE.md` / `MAINTAINERS`、`FUNDING.yml`、路線圖、標籤與里程碑計畫、社群預覽圖、示範 GIF、文件站（只有 Markdown 與 `docs/README.md` 索引）   |
| 文件在地化         | README 有繁中；`docs/` 只有英文；內部研究文件為繁中，混用                                                                                                |
| 預設分支           | 本機工作分支 `aether/product`；公開要用乾淨複本的 `main`，檢查清單已涵蓋                                                                                   |
| 單人維護風險       | 巴士因子 = 1；提交節奏極高（4 天 436 個提交），公開後 issue 量會超過維護能力；沒有「不提供支援」聲明                                                       |

## 七、風險登記簿

| #   | 風險                                                           | 可能性 | 影響 | 證據                                                                    | 緩解                                                                                  | 需決策 |
| --- | -------------------------------------------------------------- | ------ | ---- | ----------------------------------------------------------------------- | ------------------------------------------------------------------------------------- | ------ |
| R1  | 歷史含作者家目錄路徑（`.blend`、1 個測試檔）永久公開           | 高     | 中   | `oss:check --history` 失敗 5 項                                         | 用 history-apply 在複本重寫後才公開                                                    | 是     |
| R2  | 歷史 449 MB，首次 clone 慢、push 警告                          | 高     | 中   | pack 499 MB、517 個舊動物二進位                                         | 同 R1，重寫後約 37 至 42 MB                                                            | 是     |
| R3  | 公開後 CI 第一天紅燈（gitleaks 假 token）                      | 高     | 低   | `oss:check` 失敗；5 筆 `ghp_` 假值                                      | 擴充 `.gitleaks.toml` allowlist                                                        | 否     |
| R4  | 歷史清理文件數字過期且有事實錯誤                               | 高     | 中   | 文件寫 296 commits、1 個 trailer；實際 466、約 189                      | 以現況重新量測並更正文件，再決定策略                                                   | 否     |
| R5  | 專案名稱衝突或不易搜尋                                         | 中     | 中   | UK 商標公報 AETHER 第 9/42 類；`macreat/aether`                          | 公開前做正式檢索；考慮加描述性副標或改名                                               | 是     |
| R6  | 供應商標誌（星芒、結）被視為改作商標                           | 低-中  | 中   | `trademarks.md` 殘餘風險                                                | 換中性圖示，或寫信取得許可                                                             | 是     |
| R7  | LAN 模式下 token 洩漏且無輪替指令；`*.local` Host 較寬鬆       | 中     | 中   | F24 未完全修、F25 未改                                                  | 新增 `rotate-token`；LAN 模式預設只收配對碼；文件標明                                   | 否     |
| R8  | 無備用通報管道；PVR 未啟用則無人可通報                         | 中     | 高   | SECURITY.md 只有 GitHub PVR                                             | 第 0 天啟用 PVR 並實測；加備用信箱；寫實際的回覆時限（例如 7 天，盡力而為）            | 是     |
| R9  | 單人維護者過載、倦怠                                           | 高     | 高   | 無 SUPPORT、無治理文件、提交節奏極高                                    | 「實驗性、盡力而為、無支援」聲明；issue 範本；自動關閉閒置；暫時關閉 Discussions       | 是     |
| R10 | Linux 與 Windows 行為未驗證，陌生人回報大量平台問題            | 高     | 中   | 驗證帳本、CI 僅 Ubuntu 完整跑                                           | 平台矩陣寫明「macOS 已驗證、Linux 盡力」，Windows 明確不支援                           | 否     |
| R11 | AI 協助出處透明度不足（清 trailer 後）                         | 中     | 中   | README 無聲明                                                           | 補 AI 輔助聲明；保留或總結 AI 參與                                                     | 是     |
| R12 | DCO 宣稱但無強制                                               | 中     | 低   | CONTRIBUTING 與 CI 不一致                                               | 加 DCO 檢查或改成建議                                                                  | 否     |
| R13 | 依賴漏洞無人看（audit 只報告）                                 | 中     | 中   | `continue-on-error`；本次未能執行                                        | 開啟 Dependabot alerts 與 security updates；第 1 週手動跑一次                           | 否     |
| R14 | 日誌帶主機名、研究文件含內部決策                               | 低     | 低   | pino `hostname`；研究截圖                                               | 關閉 hostname；決定研究文件是否隨出                                                    | 否     |

## 八、歷史方案建議

三個方案（詳見 `history-cleanup.md`）：**A** 全新里程碑歷史（26 個提交，約 37 MB，最乾淨、最失真）；
**B** 保留全部提交並清洗（295 個，約 42 MB，保留 blame 與 bisect，審閱量最大）；
**C** B 加上自家提交壓成里程碑（55 個，約 37 MB，上游保留原貌）。

**建議 C**，理由：
1. 本案提交 436 個中，近 4 天內產生的極密集 AI 輔助提交，單提交 blame 與 bisect 價值低，而 311 個主旨超過 72 字、60 個是工具產生的 merge，保留它們只會增加噪音；
2. 上游 30 個提交保留作者、日期、訊息，守住 MIT 歸屬，這是 A 做不到的；
3. 同時移除家目錄路徑與舊二進位，體積降到 40 MB 以下；
4. 里程碑清單是唯一需要人工審閱的東西，工作量最可控。
若維護者重視 `git bisect`，才選 B；A 只在想要最小化歷史風險、可接受上游貢獻者只在 NOTICE 具名時使用。
執行順序：先更正文件並以現況重新規劃（數字已變）→ 建立 `.oss-private-patterns` → 決定 trailer 與 noreply 信箱 → 規劃、dry-run、套用 → `history-verify.sh --full` 必須為 GO → 才建立私有 repo。

## 九、判定與清單

**GO-WITH-CONDITIONS。**

**阻擋公開（Blockers）**
1. 完成歷史清理（R1、R2），`history-verify.sh --full` 為 GO；先建立 `.oss-private-patterns` 並重掃。
2. 修 `.gitleaks.toml` 讓 `oss:check` 全綠（R3）。
3. 更正 `history-cleanup.md` 的過期數字與「1 個 trailer」錯誤，再重新量測（R4）。
4. 決定專案名稱（正式商標檢索後；R5）與供應商標誌處置（R6）。
5. 啟用並實測 Private Vulnerability Reporting，補備用聯絡方式（R8）。
6. 把版本由 `0.4.0-dev.0` 換成發佈版本並讓版本測試通過；只推 `main`，不推舊標籤、worktree 分支、stash。
7. 補 AI 輔助聲明（若清除 trailer；R11）與「實驗性、無支援保證」聲明（R9）。

**應該修（第一個月內）**：token 輪替指令與 LAN 預設（R7）、`*.local` 收斂（F25）、DCO 檢查（R12）、
關閉 log hostname（R14）、`SUPPORT.md` / `MAINTAINERS`、Linux 實機驗證、第二位 Code Owner、`design-review.md` 標註各項修復狀態、
README 補平台與隱私的小修正、重拍有 QR 的截圖。

**可以等**：文件站、社群預覽圖與示範 GIF、docs 英中雙語、Sponsors、路線圖、Windows 支援、CodeQL。

## 十、時程

**第 0 天（公開當天，約 1 至 2 個工作天準備）**
- 更正歷史文件 → 重新規劃 → 套用 → verify GO；擴充 gitleaks allowlist；建立私有 repo 並推 `main`，等 CI 綠。
- 設定：描述、主題、PVR、secret scanning、push protection、Dependabot alerts、分支規則集、預設 Actions 唯讀、首次貢獻者需核准。
- 版本換成發佈版本、打 tag、建立 pre-release、附 SBOM；在另一台機器照 README 乾淨安裝一次。
- 用 GitHub 程式碼搜尋找一次私人字串，然後改為公開。

**第 1 週**：觀察第一批 issue；手動執行 `pnpm audit`；補 SUPPORT / MAINTAINERS；建立標籤；在 Linux 機器實跑；寫第一版路線圖（只列已決定的）。

**第 1 個月**：`rotate-token` 與 LAN 預設收斂；DCO 強制；社群預覽圖與示範 GIF；提高驗證帳本的「部分」項目；
檢討 issue 量與維護負荷，必要時縮小範圍或徵求第二位維護者。
