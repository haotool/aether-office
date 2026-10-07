# Orca 疊加層的向前相容設計：新版 Orca 如何「自動可用」而且可被信任

日期：2026-10-07。性質：唯讀研究，未改任何程式碼，未執行 Orca，未連網，未呼叫付費模型。
承接 [Orca 唯讀 3D 辦公室視圖：可行性研究](orca-view-feasibility.md)（下稱「可行性研究」），沿用它的方案 B：同源 transcript / hook（路徑 c）加薄映射，再加選配的 `orca` CLI 疊加層。
標記：**[已驗證]** 讀過程式碼或文件原文；**[推論]** 由程式碼合理推得；**[未知]** 需實測。
`orca:` 指 `.research/orca/`（commit `373d951b`，`package.json:3` 版本 1.4.214）。無前綴的路徑是本 repo。

## 0. 先講結論

維護者的要求是「未來新版 Orca 也都能自動使用載入」。誠實的說法是：**沒有任何設計能保證未來版本永不破壞**，因為 Orca 沒有對第三方承諾 JSON 形狀。能做到的是三件事：

1. 新版 Orca 出現時，**不需要改 AETHER 就會被偵測、探測、並在探測通過時自動啟用**（「自動」）。
2. 探測不通過時，**只退回今天的行為（路徑 c），不會比今天差**，且使用者看得到原因（「可信」）。
3. 我們在**不連網、不花錢**的前提下，用錄製的 fixture 與維護者手動執行的探針，主動發現漂移（「不靠運氣」）。

「自動」的意思是「自動探測與自動降級」，不是「自動宣告相容」。這個區別決定了整份設計：版本號只作為診斷資訊，**能力探測（capability probing）才是閘門**。

## 1. 「自動可用」的具體定義：三個相容等級

### 1.1 等級定義

| 等級 | 進入條件（全部成立） | 行為 |
|---|---|---|
| **full** | `orca --version` 取得版本；`orca status --json` 回傳 `ok:true` 且 `runtimeProtocolVersion` 落在 `orca-compat.json` 驗證過的視窗；`worktree list --json`（必要時 `ps`）的必要欄位全部解析成功 | 使用 Orca 的名稱、狀態欄、PR、父子關係 |
| **degraded** | 能連上但至少一項不符：版本或協定版本在驗證視窗之外、capability 清單缺項、必要欄位成立但選用欄位缺失或型別錯誤、輸出被截斷（`truncated:true`） | 只使用**逐欄位通過驗證**的資料；其餘欄位視為未知（`null`），徽章標「未驗證版本」 |
| **off** | `orca` 不在 PATH；Orca 未執行；協定被 Orca 自己判定不相容；JSON 不是預期的信封；逾時；輸出過大；斷路器開啟；使用者在設定中關閉 | 完全不使用 CLI，等同路徑 c（今天的行為）。路徑 c 的來源徽章仍可顯示（見 1.2） |

等級是**每次探測的結果**，不是安裝時決定一次。同一次執行中可以 full → degraded → off，再自動回來。

### 1.2 使用者看到什麼

| 位置 | full | degraded | off（含各原因） |
|---|---|---|---|
| 來源徽章（session 面板與動物名牌） | 「Orca」 | 「Orca（未驗證版本）」，名稱等 Orca 專屬資料只顯示通過驗證者 | 路徑 c 命中（cwd 在 Orca workspace 根目錄）時仍顯示「Orca」，tooltip 寫「僅依路徑判斷，無 Orca 詳細資料」；沒命中則無徽章 |
| Settings → Sources → Orca | 「已連線，Orca 1.x.y，協定 3，已驗證」 | 「已連線，Orca 1.x.y，此版本尚未驗證；已使用 N / M 個欄位」 | 各原因一行（見下表），並附「重新探測」按鈕與「關閉」開關 |
| `pnpm run doctor` | `orca` 一行 `ok` | `orca` 一行 `version_mismatch`（顯示 `~`） | `missing`（未安裝）；**doctor 不得因 Orca 缺席而 exit 1**（Orca 是選配，現有 doctor 只在 `missing`/`native_failure` 時 exit 1，`scripts/doctor.ts:168-170`，所以 Orca 缺席要用 `warn` 而非 `missing`） |
| 空狀態 | 無 | 無 | 沒有 Orca 來源時整個區塊不渲染，不顯示空殼 |

off 的原因代碼與使用者文案（zh-TW / English 兩語，走 `apps/web/src/i18n`）：

| 原因代碼 | 說明 |
|---|---|
| `not_installed` | 找不到 `orca` 指令 |
| `not_running` | 找得到 CLI，但 Orca app 未執行（CLI 回 `runtime_unavailable`） |
| `incompatible` | Orca 自己回報協定視窗不相容，或協定版本落在我們驗證視窗之外且必要欄位解析失敗 |
| `bad_output` | 輸出不是預期的 JSON 信封，或必要欄位缺失 |
| `timeout` / `too_large` | 逾時或輸出超過上限 |
| `breaker_open` | 連續失敗，暫停到某時間（顯示剩餘秒數） |
| `disabled` | 使用者在設定中關閉 |

### 1.3 每個整合點的失敗模式

| 整合點 | 證據 | 漂移方式 | 後果與處置 |
|---|---|---|---|
| `orca --version` | `orca:src/cli/index.ts:69-77` 只在 `argv.length===1` 且為 `--version`/`-v` 時輸出純版本字串；讀 `package.json`，失敗時寫 stderr 並非零退出 [已驗證] | 改名、改輸出格式、多帶前綴 | 解析失敗只代表「版本未知」，**不是 off**；版本只是診斷標籤（見第 2 節） |
| `orca status --json` | `orca:src/cli/specs/core.ts:17-23`；型別 `orca:src/shared/runtime-session-contracts.ts:64-130` 含 `runtimeProtocolVersion?`、`minCompatibleRuntimeClientVersion?`、`capabilities?` 皆為**選用** [已驗證] | 欄位改為必填、改名、移除 | 缺 `runtimeProtocolVersion` 在 Orca 自己的規則裡等於 0（`orca:src/shared/protocol-compat.ts:21-24`），我們同樣視為「未知協定」→ degraded，不是 full |
| JSON 信封 | `orca:src/shared/runtime-rpc-envelope.ts:11-45`：`{id, ok, result, _meta:{runtimeId}}`，成功與失敗都走同一信封；Orca 自己用 `.strip()` 吃掉新增欄位 [已驗證] | 信封結構改變（極少，會是協定升版） | 我們只認 `ok` 與 `result`；信封不符 → `bad_output` |
| `orca worktree list/ps --json` | `orca:src/shared/runtime-worktree-contracts.ts:38-77`（summary）、`:123-131`（`worktrees/totalCount/truncated/hostScope?`） [已驗證] | 欄位增減、`workspaceStatus` 由字串改列舉、`path` 改名 | 逐欄位驗證；對不上 `path` 就無法與 session 對齊，該列丟棄但不影響其他列 |
| RPC 協定版本 | `orca:src/shared/protocol-version.ts:34-36`：`RUNTIME_PROTOCOL_VERSION=3`，最低相容 2；「新增方法或選用欄位不升版；移除方法、改欄位語意才升版」[已驗證] | 升到 4 | 升版代表「語意改變」，正是我們欄位可能失準的時機。協定版本超出驗證視窗 → degraded（並跑必要欄位檢查），而不是 off：升版不必然破壞我們讀的那幾欄 |
| 環境變數 | CLI 讀 `ORCA_USER_DATA_PATH` 決定實例（`orca:src/cli/runtime/metadata.ts:49-51`）；agent PTY 內有 `ORCA_WORKTREE_ID` 等（可行性研究 #13，`orca:src/main/providers/local-pty-launch-helpers.ts:8-13`） | 改名 | 對 CLI 路徑無影響（我們不設定它，只在使用者自己已設定時才傳遞）；對 d-lite（hook 多記兩欄）影響：改名後欄位為 `null`，退回路徑判斷 |
| hook payload | Orca 的 hook 是在 `~/.claude/settings.json` 附加條目（`orca:src/main/claude/hook-settings.ts:147-177`）[已驗證]；AETHER 的 hook 讀 Claude 自己的 payload，**與 Orca 的 hook 格式無關** | Orca 改自己的 hook | **對 AETHER 零影響**（這正是路徑 c 的價值）。唯一交互是雙 `PermissionRequest` 行為 [未知]，與版本漂移無關，屬 Phase 0 |
| state 目錄搬移 | CLI 自己解析 userData（`metadata.ts:42-70`）；我們不讀 | 搬家 | CLI 路徑完全不受影響（另一個選用 CLI 的理由）。**我們不得**自己組路徑 |
| 認證變更 | CLI 自己讀 `orca-runtime.json` 內 `authToken`（可行性研究 #8）；AETHER 不碰 | 改為互動登入、改 token scope | CLI 回 `runtime_unavailable` 或非 JSON → `not_running` / `bad_output`；若 CLI 需要互動，逾時處理並進斷路器（Phase 0 STOP 條件） |
| 是否會拉起 Orca 視窗 | 只有 `orca open` 呼叫 `launchOrcaApp()`（`orca:src/cli/runtime/client.ts:273-285`，唯一呼叫點）[已驗證] | `status` 改成自動啟動 | **[推論]** 目前 `status` 不會啟動 app。我們的 fixed args 只含 `--version`、`status`、`worktree list/ps`，**永不呼叫 `open`**；契約測試要鎖住這一點（參數白名單） |

## 2. 讓漂移可承受的設計原則

### 2.1 能力探測，不是版本釘死

- **版本字串**只用來顯示、記錄與選 fixture，**不當閘門**。理由：可行性研究 §6 指出同一 minor 已有 200 多個 patch（`package.json:3` 為 1.4.214，而 `Casks/orca.rb:4` 的穩定 cask 為 1.3.24，`Casks/orca@rc.rb` 為 1.4.36-rc.3，代表通道間差距就很大）。Codex 的「逐版本列表」機制（`packages/providers/src/compat.ts:8-12`）在這種節奏下維護不起。
- **閘門依序是**：(1) 信封可解析且 `ok:true`；(2) `runtimeProtocolVersion` 與 `capabilities` 存在（有就記錄、缺就 degraded）；(3) 該次要用的欄位逐一通過 schema。
- **`orca --help --json` 不存在**：`orca:src/cli/index.ts:92-100` 的 help 是文字輸出 [已驗證]。我們**不解析 help 文字**（那是脆弱的假能力探測）。能力探測的來源只有 `status` 回傳的 `capabilities` 陣列（型別 `RuntimeCapability = 已知列舉 | (string & {})`，`orca:src/shared/protocol-version.ts:451`，天生允許未知值）。
- **選用欄位的存在就是能力**：例如 `hostScope`、`parentWorktreeId`、`linkedPR` 缺席 → 該功能顯示為未知，其餘照常。

### 2.2 寬容的讀取器

- 解析用 zod，**只列出我們要用的欄位**；物件用 `.passthrough()` 不是為了保存，而是明示「未知欄位不是錯誤」。**預設不保留未知欄位**（privacy，見第 4 節）；只在 `orca:probe` 的漂移診斷中記錄「未知欄位名稱」（不含值）。
- 每個欄位用 `.catch(default)` 或 `safeParse` 逐欄降級；一列壞掉丟那一列（附計數），**絕不 throw 進掃描迴圈**。Orca 自己也採同樣的寬容策略（信封 `.strip()`，`runtime-rpc-envelope.ts:11-14` 註解「clients and runtimes update independently」）。
- 數字欄位要 `Number.isFinite`；時間戳是毫秒（`updatedAt` 等，`runtime-worktree-contracts.ts:28-29`）要有合理範圍檢查；字串要長度上限與控制字元清理（走既有 `cleanTitle`、`neutralizeHtml`）。
- 列舉欄位（如 `workspaceStatus: string`，目前型別就是 `string`，`:57`）當成不透明字串顯示，不做 `switch` 窮舉；未知值顯示原字串（經清理）。

### 2.3 CLI 執行的安全與成本控制

沿用本 repo 已有的 `execFile` 習慣（`apps/control/src/services/agent-processes.ts:261-262,300-301`：`timeout: 4000`、`maxBuffer`；`git-health.ts:14-17`）：

| 項目 | 設計 |
|---|---|
| 呼叫方式 | `execFile`（不經 shell）、固定 args 白名單：`['--version']`、`['status','--json']`、`['worktree','list','--json','--limit','<n>']`、`['worktree','ps','--json','--limit','<n>']`。不接受任何使用者輸入進 args |
| 環境變數 | **白名單傳遞**：`PATH`、`HOME`、`LANG`，以及使用者自己已設定的 `ORCA_USER_DATA_PATH`。其他全部不傳（不把 `AETHER_*` 令牌、provider 金鑰帶給外部行程） |
| 認證 | **永不讀取 `orca-runtime.json`**，也不讀 `endpoint.env`（皆含 token，可行性研究 #5、#8）。CLI 自己讀它自己的 token |
| 逾時 | `--version` 3 s；`status` 3 s；`list/ps` 5 s（可行性研究 Phase 0 的 Stop 線）。逾時用 `execFile` 的 `timeout`（SIGTERM 給**我們自己**啟動的子行程，非他人行程） |
| 輸出上限 | `maxBuffer` 2 MiB；超過即丟棄為 `too_large`。注意 `ps` 的每列含 `prompt`、`lastAssistantMessage`、`toolInput`、`preview`（`runtime-worktree-contracts.ts:14-30,73`），單一 worktree 就可能很大 |
| 並行 | 全域最多 1 個 orca 子行程（單飛，single-flight）；探測進行中的新請求共用同一個 Promise |
| 解碼 | 以 `Buffer` 取回，`TextDecoder('utf-8',{fatal:true})`；非 UTF-8 → `bad_output`，不嘗試修復 |
| 工作目錄 | 固定為 AETHER 資料目錄之外的中性目錄（例如 `os.tmpdir()`），避免 CLI 以 cwd 推導 worktree 情境 [推論：`orca worktree current` 之類命令會用 cwd，雖然我們不呼叫] |

### 2.4 快取、負快取、斷路器、關閉開關

- **TTL 快取**：成功結果依「見第 4.3 節」的間隔重用；掃描迴圈（每 2 秒）**只讀快取，不等 CLI**。
- **負快取**：`not_installed` 快取 5 分鐘（PATH 很少在執行中改變）；`not_running` 快取 15 秒；`bad_output`／`incompatible` 快取到下次「版本字串改變」或使用者按「重新探測」。
- **斷路器**：連續 3 次失敗（逾時、非零退出、`bad_output`）→ 開啟；退避 30 s → 2 min → 10 min 封頂；半開時只放 1 次探測。一次成功即重置。狀態在 Settings 顯示剩餘時間。
- **關閉開關**：設定 `AETHER_ORCA=auto|off`（文件寫入 `docs/configuration.md`）與 Settings → Sources 的同一開關；`off` 時**不 spawn 任何子行程**，連 `--version` 都不跑。
- **保證退回路徑 c**：疊加層是純加法。合併函式的輸入是「已算好的 `LocalSession[]` + 可選的 Orca 快照」，輸出是同一陣列、僅多了可選欄位；快照為 `null` 時輸出與今天逐位元組相同。這由一個**等價測試**鎖住（第 5 節 U-9）。

## 3. 不連網、不花錢地追上游

### 3.1 契約測試與錄製的 fixture

- 每個**支援的 Orca 版本**錄一組 fixture（黃金輸出）：`tests/aether/fixtures/orca/<版本>/{version.txt,status.json,worktree-list.json,worktree-ps.json}`，**已脫敏**（路徑換成 `/home/user/...`、`prompt`、`lastAssistantMessage`、`toolInput`、`preview` 一律換成固定佔位字串或空字串；token 欄位不存在）。
- 契約測試把每份 fixture 餵給純解析器，斷言：(a) 解析成功、(b) 等級為預期、(c) 輸出的必要欄位值。再加「變異」fixture（第 5 節）。
- 錄製只在**維護者自己的機器**上執行一次（`orca:probe --record`，輸出前強制脫敏並印出被移除的欄位名稱與數量，不印值）。

### 3.2 版本矩陣：重用 `compat.json` 機制

現有機制（已驗證）：`packages/providers/generated/compat.json` 含 `verifiedCliVersions`（Codex，逐版本）與 `claudeCodeSeries`（Claude，以 minor 系列接受）；`packages/providers/src/compat.ts:1-27` 讀它；`scripts/doctor.ts` 比對；`tests/aether/provider-compat.test.ts` 鎖行為，其中有一個**對真實已安裝 CLI 跑一次**的測試（`it.skipIf(real.status !== 0)`），沒裝就跳過；`docs/provider-compatibility.md:8-18` 說明「版本未列出即拒絕」。

Orca 應**重用同一機制，但採 Claude 式的系列規則，不採 Codex 式的逐版本**：

```jsonc
// packages/providers/generated/orca-compat.json（新增，與 compat.json 同目錄、同讀法）
{
  "verifiedSeries": ["1.4"],              // 與 claudeCodeSeries 同概念
  "verifiedProtocolVersions": [2, 3],     // 與 orca:src/shared/protocol-version.ts:34-36 的視窗對齊
  "fixtures": ["1.4.214"],                // 錄過 fixture 的版本，供 orca:probe 比對
  "method": "…如何驗證的一句話…"
}
```

- 為何另開一個檔而不是塞進 `compat.json`：`compat.json` 的鍵是 provider 專屬且被 `compat.ts` 直接 import；Orca 是**疊加層**而非 provider，不應污染 provider 的 `assert*Version` 路徑（那些在版本未驗證時 **throw**，而 Orca 必須是「降級不 throw」）。
- 純函式放 `packages/providers/src/orca-compat.ts`：`orcaLevel(versionOutput, status)` 回傳 `full | degraded | off` 與原因，**不做 I/O**，所以 `packages/providers` 可以保持純淨。
- **版本在系列內即視為 full 的前提**是協定視窗與必要欄位通過；兩者之一不過就降到 degraded。這比 Claude 的「系列即接受」更嚴，因為 Orca 沒有被固定的 SDK 當契約。
- 產生器：`scripts/orca-compat.ts`（仿 `docs/provider-compatibility.md:17` 的「裝上、跑 doctor 與測試、再加入」流程）：讀 `fixtures` 目錄推導 `fixtures` 欄位，確認每個版本的 fixture 都過契約測試，才寫入 `verifiedSeries`。**自動化只負責檢查與格式化，把版本加入 `verifiedSeries` 仍是人工決定**。
- doctor 讀同一檔，輸出 `orca` 一行（第 1.2 節）。

### 3.3 `pnpm run orca:probe`（維護者手動）

- 新增 `scripts/orca-probe.ts`，只在維護者機器、Orca 在跑時執行：呼叫 §2.3 的同一套固定 args，**用同一個解析器**，輸出：版本、協定版本、capability 數量與**新增／消失的 capability 名稱**、每個必要欄位的通過數 / 總數、**未知欄位名稱清單**（只有名稱）、相對於最近 fixture 的差異摘要、判定等級。
- **絕不印任何值**（不印路徑、名稱、prompt、PR 標題），只印形狀與數字，符合本 repo「從不記錄祕密」的規則。
- `--record` 才寫 fixture，且脫敏後再寫；寫入前 `git diff --stat` 讓維護者檢視。
- 退出碼：0 = full，1 = degraded（漂移），2 = off。方便維護者在升級 Orca 後跑一次當作「升級檢查」。

### 3.4 選配的排程 CI 金絲雀（預設關閉）

設計（**本研究不新增 workflow 檔**，只描述）：

- GitHub Actions `schedule` cron（每週一次）加 `workflow_dispatch`；預設以 repo 變數 `ORCA_CANARY=on` 才執行，否則第一個 job 直接結束。
- 步驟：用 GitHub Releases API 取得最新**已發布**（非 draft、非 prerelease）release 的資產清單 → 下載對應平台資產 → 驗證 sha256 → 在**無網路、無 secrets、唯讀 token** 的 sandbox 內只跑 `--version`。**Linux runner 上跑不了 macOS 的 `.dmg`**；若以 Linux 資產（AppImage / deb）做，需要驗證那個資產是否帶同一個 CLI 與是否能在無顯示環境執行 [未知]。
- **能在 CI 做到的只有 `--version` 與 help 文字**；`status`、`worktree list/ps` 都需要**執行中的 Orca**（`runtime_unavailable` 時 CLI 直接說 "Orca is not running"，`orca:src/cli/cli-error.ts:46-51,72-76`），除非用 `orca serve` 無頭模式（`orca:docs/reference/headless-linux-server.md`）[未知：是否可在 CI 中無認證啟動與是否需要網路]。因此 CI 金絲雀的實際價值有限：它只能發現「版本字串格式變了」與「`--help` 文字變了」，**抓不到 `worktree ps` 形狀漂移**。
- 偵測到漂移 → 以 `gh issue create`（需 `issues: write`）開一個 issue，內容只有形狀與數字。
- **供應鏈與權限警告**：
  1. 下載並執行第三方二進位是供應鏈風險；必須固定 `permissions: contents: read, issues: write` 且不傳任何 secrets，job 不得有 `GITHUB_TOKEN` 以外的憑證。
  2. 需驗證下載資產的 hash 與 Homebrew cask 上列的 sha256（`Casks/orca.rb:4-6`）是否一致，不一致就停。
  3. 第三方 action 釘死 commit SHA；不使用 `curl | sh`。
  4. 排程 workflow 會讓 CI 產生對外網路流量，屬於 `AGENTS.md` 的「未經授權不得…」邊緣，所以**預設關、須維護者明確啟用**。
  5. 這個 job 是「通知」，不是 merge gate；失敗不得阻擋 PR。

### 3.5 版本如何被發現

| 來源 | 證據 | 優缺點 |
|---|---|---|
| GitHub Releases API（`stablyai/orca`） | `Casks/orca.rb:12-15` 的 `livecheck ... strategy :github_latest`；release 流程先建 **draft** 再上傳資產，`/releases/latest` 不會提早指到殘缺的 release（`.github/workflows/release-mac-build.yml:183-191` 的 draft 檢查，`daily-mac-build.yml:43-46`） [已驗證] | 最即時，含 rc；需要網路與（可能的）API 限速 |
| Homebrew cask（`orca`、`orca@rc`） | `Casks/orca.rb` 版本 1.3.24 與 `orca@rc.rb` 1.4.36-rc.3，**都落後於 `package.json` 的 1.4.214** [已驗證] | cask 更新有延遲，**不能當「最新版」依據**，只能當「穩定通道的下限」 |
| 使用者本機實際安裝的版本 | `orca --version` | 這才是 AETHER 在執行時唯一需要關心的版本 |

結論：維護者用 Releases API 追上游（人工或選配 CI）；**AETHER 本身在執行時只看本機 `orca --version`**，從不查詢上游。

### 3.6 為何 app 絕不自動下載或更新 Orca

- Orca 自己用 `electron-updater` 做就地更新（`Casks/orca.rb:23-27` 註解、`auto_updates true`）。多一個更新者就會互相競爭、改動使用者的 `/Applications`。
- AETHER 的原則是唯讀、本機優先（`AGENTS.md`：「Protect user data」；`docs/architecture.md`「Observed sessions are never given control authority」）。下載並執行未簽章或未驗證的二進位違反這個邊界，也需要網路權限與新的威脅模型。
- 新版 Orca 由使用者自己升級；AETHER 在下次探測時自動看到新版本，這就是「自動使用」的完整含義。

## 4. 程式碼位置、契約、診斷、效能與隱私

### 4.1 模組位置（符合 `scripts/check-boundaries.mjs`）

| 內容 | 位置 | 理由（證據） |
|---|---|---|
| 純解析器、等級判定、版本矩陣讀取 | `packages/providers/src/orca-compat.ts`、`orca-parse.ts` 與 `generated/orca-compat.json` | `packages/providers` 不得 import control（`check-boundaries.mjs:24`），純函式不需要 I/O；與 `compat.ts` 並列 |
| `execFile` 轉接、快取、斷路器、單飛 | `apps/control/src/services/orca-source.ts` | control 才有 Node I/O；與 `agent-processes.ts` 同層、同風格 |
| 與 session 合併 | `apps/control/src/services/local-sessions.ts`（讀快取、不等待） | 現有合併點 |
| 變更事件 | `apps/control/src/services/session-changes.ts`：`ChangeKind`（`:9`）新增 `'source'` | 讓 SSE 帶「來源變了」，仍是無內容事件 |
| 顯示與徽章 | `apps/web/src/features/office-model.ts` 等 | web 不得 import `node:` 或 providers（`check-boundaries.mjs:21-22`），所以等級與原因以**契約型別**傳過去，不 import 解析器 |
| 探針與產生器 | `scripts/orca-probe.ts`、`scripts/orca-compat.ts` | `scripts/` 已放 doctor 等 |

### 4.2 `packages/contracts` 的新增（全部選用）

- 現狀：`localSessionSchema`（`packages/contracts/src/sessions.ts:~83-`）的 `provider` 是 `z.enum(['claude','codex'])`，`worktree` 含 `root/main/project/linked`。
- 新增（皆 `.optional()` 或 `.nullable().default(null)`，與既有欄位如 `conflicts: ... .default(0)`、`agentId ... .default(null)` 同一手法）：
  - `source: z.enum(['orca']).nullable().default(null)`（**不改 `provider`**，因為 Orca 不是 provider，是來源）。
  - `orca: z.object({ worktreeId, displayName, workspaceStatus, parentWorktreeId, linkedPR, level, hostKind }).partial().nullable().default(null)`：每欄皆可缺。
  - 回應層級（非每個 session）新增 `sources: { orca: { level, reason, version, protocol, checkedAt, breakerUntil } }`，放 `/api/system` 或 session 回應的頂層。
- 舊 client：`apps/web/src/local-session-compat.ts:11-48` 的 `normalizeSession` 正是處理「控制面比頁面舊／新」的樣板（缺欄補未知值）。新增欄位在那裡補 `source ?? null`、`orca ?? null`，一個欄位壞掉不得拖垮整頁。舊 client 遇到新欄位：zod 預設會 strip 未知欄位，所以也不會壞。
- **不得**把 `prompt`、`lastAssistantMessage`、`toolInput`、`preview`、`comment` 加進契約。

### 4.3 診斷、SSE、重新整理、效能預算

- doctor：`scripts/doctor.ts` 的 `Status` 已有 `warn`、`version_mismatch`（`:11-12`），`Probe.run` 已有 `enoent/timeout` 分類（`:24-37`）。新增 `orca` 檢查：`enoent` → `warn`（非 `missing`，避免 exit 1，`:168-170`）。`checkEnvironment` 目前是**純函式 + 注入 Probe**，新檢查沿用同形式即可用現有的 `tests/aether/doctor.test.ts` 風格測試。
- SSE：Orca 快照變動時只發 `{seq,key,kinds:['source']}`（`docs/architecture.md` 資料流 2 的「內容不外洩」性質不變）；等級變動以頂層 `sources` 帶，頁面重抓 `/api/system`。
- **掃描迴圈不得變慢**（硬規則）：掃描只讀記憶體快取；CLI 呼叫在**背景計時器**，與掃描解耦。
- **成本量測**（本機、已量）：此機器上 `spawn /usr/bin/true` 中位數約 1.3 ms，`node -e 0` 約 20 ms（10 次）。**`orca` CLI 是 Electron 的 node 模式啟動，成本 [未知]**（未裝 Orca，無法量；依經驗 Electron 內的 node 模式啟動可能是數十到數百毫秒，且還要連 Unix socket 並等 RPC 回應）。所以 Phase 0 必須量 `status` 與 `ps` 的牆鐘時間，並把結果寫進 `orca-compat.json` 的 `method`。
- **建議間隔**（在量測前的保守預設，**不是**量出來的）：
  - 無 Orca 來源的 session 存在、也無使用者開啟 Settings → 不呼叫（0 次/秒）。
  - 有 Orca 來源 session 時：`worktree list` 每 15 s；`ps` 只在有 agent 行（session 已命中 Orca 路徑）且有瀏覽器連線時每 5 s。
  - `--version`：每次 `status` 失敗後重新判斷，或每 10 分鐘一次。
  - 以背景計時器與單飛執行；若上一次尚未回來就跳過這一輪。
- 預算驗收：用既有的 `AETHER_SCAN_BUDGET_*` 與 `scripts/perf-matrix.mjs` 量「Orca 啟用 / 停用」兩組的掃描耗時，差異在雜訊內（比如 p95 差 < 5%）才算過。

### 4.4 隱私規則

- **只保留數字與中繼資料**：`worktreeId`（不透明字串）、`displayName`（經 `cleanTitle`、長度上限）、`workspaceStatus`、父子 id、PR 號碼與 state。
- **解析器的輸出型別從不含** `prompt`、`lastAssistantMessage`、`toolInput`、`preview`、`comment`、`mainAgent`；原始 stdout 緩衝在解析後立即丟棄，不寫入日誌、不放進快取、不入 SQLite、不放進錯誤訊息。
- 錯誤訊息只含**原因代碼與計數**，不含 stdout 片段。
- 所有顯示字串過既有的 redaction 與文字管線（`apps/control/src/services/redaction.ts`、`neutralizeHtml`、`structureWrappers`、`cleanTitle`；`docs/architecture.md` 資料流 3）。
- 能用 `worktree list`（不含 agent 列）達成的映射，就**不要呼叫 `ps`**：`ps` 才含 prompt／回覆全文（`runtime-worktree-contracts.ts:14-30`）。**[推論]** `list` 不含 agent rows，需 Phase 0 實測確認；若成立，預設只用 `list`，`ps` 僅在需要 agent 狀態且路徑 c 無法提供時才用。
- fixture 脫敏規則同上，並加一個測試：fixture 與解析器輸出中不得出現看起來像 token 的字串（可重用 `redaction.ts` 的樣式）。

### 4.5 授權與商標（沿用可行性研究 §6）

只自寫 zod schema、不複製 Orca 型別或程式碼 → 不產生新義務。錄製的 fixture 是**執行 Orca 後的輸出資料**，不是其原始碼，但仍須脫敏並在 `docs/legal/provenance.md` 註明來源與用途。徽章只寫「Orca」純文字，不用其 logo（`docs/legal/trademarks.md` 的指稱式使用原則）。

## 5. 測試計畫

### 5.1 單元測試（解析器，無 I/O）

| ID | 案例 | 預期 |
|---|---|---|
| U-1 | 每個支援版本的黃金 fixture | 等級與欄位值符合預期 |
| U-2 | 丟欄位（逐一移除每個必要欄位） | 該欄位降級為未知，等級 degraded 或該列被丟棄，不 throw |
| U-3 | 欄位改名（`path` → `dir`） | 該列被丟棄並計數；全部列都被丟棄 → `bad_output` |
| U-4 | 多出未知欄位（含巢狀） | 無影響，等級不變，未知欄位不出現在輸出 |
| U-5 | 錯型別（數字變字串、陣列變物件、`null`） | 逐欄位降級 |
| U-6 | 巨大輸出（超過 `maxBuffer`）與超長字串 | `too_large`；字串被截斷 |
| U-7 | 非 UTF-8 bytes、BOM、前後有雜訊行、空輸出、多個 JSON 物件 | `bad_output`，不 throw |
| U-8 | `ok:false` 信封（`runtime_unavailable` 等，形狀見 `cli-error.ts:96-127`） | 對應 `not_running` / `incompatible` |
| U-9 | **等價測試**：Orca 快照為 `null` 時，合併後的 sessions 與未接疊加層時深度相等 | 保證「不比今天差」 |
| U-10 | 版本字串變體（`1.4.214`、`1.4.214-rc.1`、`v1.4.214`、空、含 ANSI） | 不 throw；未知版本 → degraded，不是 off |
| U-11 | 協定版本：2、3、4、缺席、字串型別 | 2、3 → full（其餘條件成立時）；4、缺席、錯型別 → degraded |
| U-12 | 斷路器、負快取、單飛（注入假時鐘） | 次數與時間符合規則 |
| U-13 | 變異式測試（property-style）：對 fixture 隨機做 U-2…U-7 的變異，各跑固定種子的 N 次 | 解析器永不 throw、輸出永遠符合契約 schema |

不得使用 `Math.random()`（`check-boundaries.mjs:37` 禁止產品碼使用；測試碼雖不在 `apps/`、`packages/` 下，仍用固定種子的小型 PRNG 以便重現）。

### 5.2 整合測試：假的 `orca` 可執行檔

- 在 `fixtures/processes/orca-fake.mjs`（與 `claude-tui.mjs`、`codex-app-server.mjs` 同風格，開頭註明「Synthetic CLI wire fixture, never Orca, never reported as live evidence」）。
- 由測試把它放進臨時目錄並加進子行程的 `PATH`（不改使用者的 PATH 或任何全域設定），以環境變數切換行為：`ok`、`slow`（超過逾時）、`huge`、`garbage`、`exit1`、`not_running`、`proto4`、`dropped`、`slow-start`（驗證掃描迴圈不被阻塞）。
- 斷言：(a) 參數白名單（假程式收到非白名單參數就以特殊碼結束並讓測試失敗，**尤其斷言從不收到 `open`**）；(b) 傳入的環境變數只有白名單；(c) 單飛與逾時；(d) 掃描迴圈耗時不因 `slow` 增加；(e) 斷路器開關；(f) 它回傳的資料在 UI/API 上標為 fixture，不當作 live 證據（遵守 `AGENTS.md`「Demo, fixture, observed, replay and live data stay distinct and labeled」）。
- 真 CLI 測試比照 `provider-compat.test.ts` 的 `it.skipIf(real.status !== 0)`：機器上有 `orca` 才跑，沒有就跳過，且**不在 CI 的必過項**。

### 5.3 端對端（Playwright）

- 有 Orca（假）／無 Orca／degraded／off-各原因 五種狀態各一個流程：徽章文案、Settings → Sources 狀態與「重新探測」「關閉」開關、空狀態不渲染。
- 不使用埠 4310-4522（本次任務限制；現有 e2e 伺服器如何選埠沿用 `scripts/e2e-server.ts` 的設定，新測試用同一機制）。
- 響應式與無障礙規格（`AGENTS.md` UI 規則）：手機與平板截圖。
- 契約相容：舊版頁面（沒有 `source` 欄）對新 server、新版頁面對舊 server 各一個測試，沿用 `tests/aether/local-session-compat.test.ts`。

### 5.4 驗證帳本（`docs/verification/features.json`）

該檔是列表，每筆含 `id、requirement、scope、implementationStatus、verificationStatus、codePaths、testIds、evidencePaths、blockers`。新增項目（實作與驗證分欄，沒跑的不得標 passed）：

| id（建議） | 內容 | 起始狀態 |
|---|---|---|
| ORCA-01 | 解析器對 fixture 的容錯（U-1…U-13） | 實作後 `implemented` / `passed`（mock） |
| ORCA-02 | 假 CLI 整合與斷路器 | `implemented` / `passed`（mock） |
| ORCA-03 | 掃描迴圈預算未退步 | 需量測，量前 `not_run` |
| ORCA-04 | 真 Orca 上的 `status`/`list`/`ps` 形狀與成本 | **`not_run`，blocker：需要裝了 Orca 的機器** |
| ORCA-05 | 雙 `PermissionRequest` hook 並存行為 | `not_run`，blocker 同上 |
| ORCA-06 | 徽章與降級 e2e | 實作後依實跑結果 |

fixture／假程式的通過**不得**填成 ORCA-04 的證據。

## 6. 分階段待辦、閘門與 STOP 條件

大小：S ≤ 1 天、M 2–3 天、L ≥ 4 天。

| 階段 | 內容 | 大小 | 相依 | 需要 Orca？ |
|---|---|---|---|---|
| A. 路徑 c 與契約 | cwd 前綴判斷（Orca workspace 根目錄可設定）、`source` 欄位、徽章、`normalizeSession` 補欄位、doctor 一行（`warn`） | M | 無 | 否 |
| B. 純解析器與矩陣 | `orca-parse.ts`、`orca-compat.ts`、`orca-compat.json`（初始 `fixtures` 為空）、U-1…U-13（以**手寫的合成 fixture**，標明合成） | M | 無 | 否 |
| C. 轉接層 | `orca-source.ts`（execFile、白名單、單飛、快取、斷路器）、假 `orca` 程式、整合測試、設定開關 `AETHER_ORCA` | M | B | 否 |
| D. UX | Settings → Sources、空狀態、i18n 兩語、e2e、截圖 | M | A、C | 否 |
| E. Phase 0 探針 | 在裝有 Orca 的機器：量 `status`/`list`/`ps` 成本、確認 `list` 不含 agent 列、錄製脫敏 fixture、確認 `status` 不會拉起視窗、確認不需要互動登入；填 `orca-compat.json` | S–M | A（最好也有 C 以便用同一解析器跑） | **是** |
| F. `orca:probe` 與契約 fixture 升級 | 把合成 fixture 換成真錄製的；`pnpm run orca:probe` | S | E | 是（錄製）；腳本本身否 |
| G. CI 金絲雀 | 選配 workflow（預設關） | S | F | 否（但只能抓 `--version`/help，見 3.4） |
| H. d-lite | hook 多記 `ORCA_WORKTREE_ID`/`ORCA_PANE_KEY` 兩欄 | S | E 的環境變數實測 | **是** |

**現在就能在沒裝 Orca 的情況下建好**：A、B、C、D 與測試、假程式、設定與文件。**必須在有 Orca 的機器**：E、F 的錄製、H、ORCA-04/05 驗證。

**Go / No-go 閘門**：
- A→C：契約變更向後相容測試（舊 client／新 server、新 client／舊 server）通過；`pnpm lint`（`check-boundaries`）通過；`pnpm run notices` 無變更。
- C→D：U-9 等價測試與掃描預算測試通過。
- D→對外宣稱「支援 Orca」：**E 完成**。在 E 之前，Settings 與文件必須標明「僅以合成資料驗證，未在真 Orca 上驗證」，徽章仍可顯示（路徑 c 不依賴 CLI）。
- E 的 Go（沿用可行性研究 Phase 0）：CLI 輸出 2 秒內回來且不改變 Orca 狀態；`worktreeId/path/branch/displayName` 與一個 agent 行能對上 AETHER session；未知欄位不致壞掉解析。

**STOP 條件（任一成立就停，回到只做路徑 c）**：
1. CLI 需要互動式登入、或 `status`/`list`/`ps` 會拉起視窗、或會改變 Orca 狀態。
2. `worktree list` 在大型 workspace 超過 5 秒，且 `--limit` 無法讓它降到預算內。
3. 輸出不是穩定可解析的單一 JSON 信封。
4. 需要讀 `orca-runtime.json` 的 token 才能運作（可行性研究全程 STOP 第 2 條）。
5. **一個月內因 Orca 發版而被打壞兩次**（可行性研究全程 STOP 第 3 條）。「打壞」的判定：`orca:probe` 退出碼非 0 且需改 schema 才恢復。
6. 掃描迴圈預算退步超過 5%，且快取與間隔調整後仍無法消除。
7. 需要複製 Orca 程式碼才做得出來（授權）。

## 7. 殘餘風險：做完之後還有什麼會靜默壞掉

1. **語意漂移（最大）**：欄位名稱與型別沒變，但**意義變了**（例如 `workspaceStatus` 的值集合、`updatedAt` 的單位、`path` 由真實路徑變成符號連結路徑）。型別檢查抓不到。Orca 只承諾「改欄位語意才升版」（`protocol-version.ts` 註解），但這保護的是它自己的 client。緩解：協定版本超出視窗 → degraded；其餘靠 `orca:probe` 與人工複查。
2. **路徑對齊錯誤**：macOS 的 `/private/var`、符號連結、大小寫不敏感檔案系統造成 `path` 比對失敗或誤配。徽章可能漏標或錯標；不會壞掉。
3. **使用者自訂 workspace 根目錄**：路徑 c 的前綴判斷在沒設定時漏標。
4. **多個 Orca 實例**（`ORCA_USER_DATA_PATH`、dev 與 prod 並存）：CLI 只連到其中一個，疊加層看到的可能不是使用者以為的那個。
5. **fixture 老化**：fixture 只代表錄製當下的版本；沒有人定期錄，矩陣就停留在舊版（這是「版本列表」機制本身的弱點，Claude/Codex 一樣）。
6. **CI 金絲雀盲區**：它無法執行 `worktree ps`（需執行中的 Orca），所以最重要的形狀漂移只能靠維護者本機的 `orca:probe` 發現。
7. **斷路器與負快取造成延遲恢復**：使用者剛啟動 Orca，最久要等 15 秒（`not_running` 負快取）才看到；可用「重新探測」按鈕縮短。
8. **假資料誤認為真**：合成 fixture 與假 `orca` 若被誤放進非測試路徑，會被當成 live 證據；以 `AGENTS.md` 的資料標示規則與測試鎖住。
9. **CLI 啟動成本未知**：直到 Phase 0 量到真數字前，第 4.3 節的間隔只是保守猜測。
10. **Orca 新增我們沒對映到的狀態**：被當作不透明字串顯示，使用者看得到但不會有圖示或顏色。

## 8. 決策摘要（10 行）

1. 「自動可用」＝自動探測、自動降級；不保證相容，保證**不比今天差**（退回路徑 c）。
2. 閘門是能力探測（信封 + 協定視窗 + 逐欄位解析），不是版本號；版本只作診斷標籤。
3. 三個等級 full / degraded / off，每次探測重新判定，Settings、徽章、doctor 都顯示等級與原因代碼。
4. 讀取器逐欄位寬容，永不 throw 進掃描迴圈；掃描只讀快取，CLI 在背景單飛執行。
5. 重用 `compat.json` 機制，但用系列 + 協定視窗（`orca-compat.json`，Claude 式），不用 Codex 式逐版本清單；doctor 缺席只給 `warn`。
6. 無網路追上游：脫敏錄製 fixture 的契約測試 + 維護者手動 `pnpm run orca:probe`（只印形狀與數字）；CI 金絲雀選配、預設關，且只能抓 `--version`/help。
7. App 永不自動下載或更新 Orca；執行時只看本機 `orca --version`。
8. 隱私：解析器型別不含 prompt／回覆／toolInput／preview；優先只用 `worktree list`；不讀 `orca-runtime.json`；env 白名單。
9. 現在可在沒有 Orca 的情況下建 A–D（約 8–10 天）；對外宣稱支援必須先完成 E（真機探針）。
10. 殘餘風險最大者是語意漂移與未知的 CLI 啟動成本；一個月內被打壞兩次即 STOP，只留路徑 c。
