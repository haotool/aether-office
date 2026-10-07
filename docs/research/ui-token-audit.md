# UI 與 design token 可維護性稽核

日期 2026-10-07 · 分支 `aether/product` (e1f8525) · 性質：唯讀稽核，修正見第 5 節的平行計畫。所有量測腳本在 scratchpad `ui-audit/`
（`analyze-css.mjs`、`roles.mjs`、`measure.mjs`、`views.mjs`、`dead.mjs`），伺服器為臨時的 4631 埠 demo 堆疊，量測後已關閉並刪除臨時檔。

## 1. 摘要

核心結論：**間距「刻度」本身其實很乾淨，不一致來自「元件角色」沒有共用規格，以及 lint 只管 5 個屬性。**

- `padding / margin / gap / font-size / radius` 的宣告 98% 到 100% 已經走 token（gap 284/284，font-size 312/315，radius 165/190 其餘是 `50%`）。
- 真正發散的是**尺寸與元件**：`width/height/min-height` 共 512 個值、163 個 distinct，其中 180 條是字面 px（78 個 distinct），lint 完全沒檢查。
- 同一角色在畫面上的高度分歧：桌面的文字按鈕實測 **12 種高度**（含單行的 22/24/26/30/35/36/37/38），輸入框 10 種，icon button 5 種（28/29/30/35/36）。
- 規則與實作落差：桌面滑鼠規則「至少 32px」被 `.icon-button` (29/30)、登出 `.text-button` (22)、專案 `select` (17)、`.secondary` (26) 違反；文件說「本文 14px」，實際 `body` 是 13px（`base.css:19`）。
- 好消息：axe 兩主題、桌面與手機 14 頁共 0 違規，無 < 11px 文字，無水平溢出，無死 CSS，焦點環在 363/370 次 Tab 中一致。

### 分數（0 到 100，越高越好維護）

評分準則：每區 5 項各 20 分（有單一事實來源、可被機器強制、實測一致、文件與程式一致、可容易地演進），依實測扣分。

| 區域                         | 分數 | 主要依據                                                                                      |
| ---------------------------- | ---- | --------------------------------------------------------------------------------------------- |
| Token 系統（定義與命名）     | 78   | 125 個 token、無未用、無未定義（4 個局部變數不計）；扁平而非分層，無 shadow/motion 刻度        |
| 刻度遵守（padding/gap/字級） | 90   | 98% 以上走 token；尺寸 (width/height) 僅 9% 走 token                                           |
| 元件一致性                   | 52   | 按鈕 12 種高度、empty 7 種實作、heading 9 種實作、radius 角色混用                              |
| 觸控與無障礙                 | 82   | 觸控 36/40/44 實測成立、axe 0 違規；桌面 32px 規則被違反、focus 環 4 種變體                    |
| CSS 組織與維護               | 74   | 52 檔、最大 649 行（> 400 的 2 檔）；`!important` 5、深選擇器 3；breakpoint 16 種、無 cascade layer |
| 主題與使用者偏好             | 55   | 有 light/dark、reduced-motion（9 檔）；0 處 forced-colors / prefers-contrast / reduced-transparency |
| RTL 與邏輯屬性               | 25   | 物理屬性 163 處（left/right 88）對邏輯屬性 18 處                                              |
| 文件與程式一致               | 68   | 15 條抽樣 9 條準確、6 條漂移（見 4.3）                                                         |

## 2. 量測表

### 2.1 Token 清單（`styles/tokens.css`，163 行）

| 家族          | 數量 | 命名                                                    | 備註                                                                 |
| ------------- | ---- | ------------------------------------------------------- | -------------------------------------------------------------------- |
| 顏色（主題）  | 17   | `--bg --surface --raised --selected --text --muted ...` | 只有 19 個有 light 覆寫                                              |
| 場景與玻璃    | 33   | `--glass* --on-glass* --scene-*`                        | 兩主題相同（夜景），設計如此                                         |
| 其他顏色      | 18   | `--art-* --scrim --shade* --kpi-* --terminal-bg`        | `--kpi-*` 以 `var(--mint)` 派生，所以自動跟主題                      |
| 間距          | 12   | `--space-N`（以 px 命名）                               | 2/4/6/8/12/16/20/24/32/40/48/64                                      |
| 圓角          | 8    | `--r-xs..3xl, --r-pill`                                 | 2/4/6/8/12/16/24/999                                                 |
| 字級          | 12   | `--fs-label/small/meta/body/lead/title/...`             | 11/12/13/14/16/18/20/24/28 + 3 個 wordmark；11 到 14 每級只差 1px    |
| 觸控與頭像    | 11   | `--target-*, --control-*, --avatar-*`                   | 與間距同值：`--control-touch(40)=--space-40`，`--target-fine(32)=--space-32` |
| 層級          | 17   | `--z-*`                                                 | 有序、命名完整                                                       |
| 動態          | 4    | `--ease --dur --dur-fast --mono`（`--mono` 不屬動態）    | 無 `--dur-slow`；28 條 transition/animation 寫字面秒數               |
| 其他          | 3    | `--safe-*` 4、`--shadow` 1、`--grid`                    | 只有一個陰影 token，但 CSS 有 47 條 box-shadow，其中 29 條字面 px     |
| 行高、斷點    | 0    | 無                                                      | 行高 12 種字面值；斷點 16 種字面值                                   |

- **分層**：扁平（原始值與語意混在一起，如 `--mint` 同時是品牌色與狀態色）。沒有 component 層（`--button-h` 之類）。
- **light/dark 對等**：40 個顏色 token 沒有 light 覆寫，全部是刻意不隨主題的場景、玻璃、art 與 kpi 派生；實際缺口 1 項：`--terminal-bg #101923` 在 light 主題仍是深色（終端機視為夜景，需決定並註解）。
- **近似重複**：`--muted #a3b5c4` 與 `--dim #8da2b3`（dark）可分辨，但 **light 主題兩者同為 `#46606f`**（重複）；`--scene-mint/blue/gold/red` 與 dark 的 `--mint/blue/gold/red` 同值；`--scrim #0008` 與 `--vignette #00000080` 差 1 個 alpha 階；`--space-32/40` 與 `--target-fine/--control-touch` 同值但語意不同。
- **未用 token**：0。**引用但未定義**：`--share --strand --depth --panel-w`，皆為元素層級由 TSX 設定的局部變數，非缺漏；另有 `--tabbar-h: 56px` 定義在 `phone-office.css:6`（lint 不看自訂屬性）。

### 2.2 Lint 實際涵蓋（`scripts/check-design-tokens.mjs`，55 行）

| 項目                                    | 是否檢查 | 備註                                                                             |
| --------------------------------------- | -------- | -------------------------------------------------------------------------------- |
| 顏色字面值（hex/rgb/hsl）               | 是       | 所有屬性                                                                         |
| z-index、font-size、padding/margin/gap、border-radius | 是 | 只比對「單行」宣告 `^\s*prop: value;`，多行值與一行多宣告會漏                    |
| `width/height/min-*/max-*`              | **否**   | 180 條字面 px、78 種值                                                           |
| `top/right/bottom/left/inset`           | **否**   | 59 條字面 px                                                                     |
| `line-height`                           | **否**   | 12 種字面值                                                                      |
| `calc()/min()/max()` 內的字面 px        | 部分     | 僅在已檢查的屬性內；`bottom: calc(8px + ...)`、`min-height: calc(56px + ...)` 不查（32 條） |
| `@media` 內的 px                        | **否**   | 16 種斷點字面值，`max-width:760px` 出現在 16 檔                                  |
| 自訂屬性 `--x: 56px`                    | **否**   | 規則直接跳過 `--` 開頭                                                           |
| `box-shadow`、`transition` 時間          | 顏色有、尺寸與秒數 **否** | 29 條字面 px 陰影、28 條字面秒數                                       |
| TSX 內聯 style                          | **否**   | 11 處 `style={{`，5 處含尺寸；其餘多為 `--var` 傳值                              |
| TS 內顏色（canvas、SVG、avatar）        | **否**   | `apps/web/src` 有 82 處 `#rrggbb`（avatar 生成與 GitGraph/TaskDag/Terminals）；`packages/office-scene` 250 處（three.js 材質，合理） |
| 掃描範圍                                | 僅 `apps/web/src/**/*.css` | 不含 `index.html` 與 `public/`                                      |

### 2.3 宣告普查（2014 條相關宣告，52 個 CSS 檔，token 解析後）

| 屬性        | 值數量 | distinct | 走 token 比例 | 只用一次 | 單位混用                                   | 超出刻度的值                                   |
| ----------- | ------ | -------- | ------------- | -------- | ------------------------------------------ | ---------------------------------------------- |
| padding     | 525    | 27       | 502/525 (96%) | 10       | px 416、`0` 85                             | 無（15 種都是 `calc(token + env(safe-area))`） |
| margin      | 333    | 16       | 217/333 (65%) | 3        | px 130、`0/auto` 196                       | 負邊距 `calc(Npx * -1)` 6 處                    |
| gap         | 284    | 9        | 283/284       | 1        | 全 px                                      | 0                                              |
| font-size   | 315    | 15       | 312/315       | 6        | px 312、**em 3**                           | `0.95em`（scene-speech:152）、`1.1em`（sessions:86）、`0.9em`（transcript:118） |
| radius      | 194    | 11       | 165/194       | 0        | px 151、`50%` 24                           | 無                                             |
| line-height | 23     | 12       | 0/23          | 5        | 全無單位                                   | 1 / 1.2 / 1.25 / 1.3 / 1.35 / 1.4 / 1.45 / 1.5 / 1.55 / 1.6 / 1.65 / 1.9 |
| width       | 282    | 98       | 32 (11%)      | 68       | px 118、%49、ch 7、vw 2、rem 1、em 1       | 字面 px 78 種                                  |
| height      | 230    | 85       | 88 (38%)      | 52       | px 169、dvh 13、vh 3、% 11                 | 字面 px 多                                     |
| inset       | 206    | 54       | 65 (32%)      | 31       | px 66、% 14                                | 字面 px 34 種                                  |

使用次數 Top：gap `8px×111, 6px×47, 4px×41, 12px×33`；padding `12px×112, 8px×96, 6px×53, 16px×42`；font-size `12px×120, 11px×118, 14px×23, 16px×15, 13px×13`。**6px 半步用量大**（padding 53、gap 47、margin 13），表示 4px 格線被廣泛放寬。

`!important` 5 條（`breakpoints.css` 3、`compact-desktop.css` 2）。選擇器 1713 條，深度 ≥ 4 的 3 條，ID 選擇器 0。

### 2.4 同角色在不同檔的規格（CSS 層）

| 角色        | 分歧（file:line）                                                                                                                                                      |
| ----------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| 主按鈕      | `controls.css:55` `min-height: 35px`（不在刻度）；觸控層 `touch-targets.css:25` 改成 `--control-touch` 40；`sessions.css:65` 26px；`breakpoints.css:265` 36px；`phone-office-scene.css:253` 56px |
| 圓角        | `.primary/.secondary` `--r-xs` 2px（`controls.css:49`）、`.icon-button` `--r-sm` 4px（`controls.css:86`）、分段控制 `--r-lg` 8px（5 處）、chip `--r-pill/50%/--r-3xl` 三種 |
| 文字按鈕    | `.text-button` padding `2px 0`、字級 `--fs-label` 11px、無 min-height（`controls.css:95`），桌面實測 22px 高                                                              |
| icon 按鈕   | padding `--space-6`、無 min-height（`controls.css:81`），桌面 28/29/30，觸控 36                                                                                          |
| 輸入框      | min-height 有 `--control-touch/-sm/--target-fine/--space-48`（forms/settings/composer）；padding `6/8` `8/12` `0/20` 並存                                                |
| 卡片 padding | `--space-12`（3）、`16`（1）、`20`（1）、`24`（2）、`8 12`（4）；radius `--r-lg` 8 或 `--r-xl` 12                                                                       |
| 列（row）   | min-height `--target-touch` 44（5）、`--target-fine` 32（2）、字面 44/56；gap `8`（14）、`12`（8）                                                                       |
| 標題區      | `.page-heading` gap 20 mb 24（`pages.css:4`）；`.office-heading`、`panel-head`、`kpi-head`、`conv-header`、`notice-head`、`modal-heading` 各自 padding 與字級               |
| 對話框/抽屜 | `--r-xl` 全圓、`--r-2xl --r-2xl 0 0` 底部抽屜、`--r-xl 0 0 --r-xl` 側抽屜；phone sheet 高 `52dvh`（`phone-sheet.css:135`）對文件的 56dvh，另一處 `56dvh`（`phone-pages.css:63`） |

### 2.5 實際渲染（Chrome headless，14 頁 × 桌面 1440×900、手機 390×844、平板 820×1180 × dark/light，另有 KPI、快速開啟、連接手機對話框、登入、英文語系、3D 辦公室）

角色高度 distinct 數（桌面，所有頁合併；手機與平板見 `measure-*.json`）：

| 角色          | 桌面 n | 高度種類          | 分佈                                      | padding Y/X 種類 | radius 種類 |
| ------------- | ------ | ----------------- | ----------------------------------------- | ---------------- | ----------- |
| 文字按鈕      | 103    | **12**            | 36、35、22、37、38、26、33、55、192...     | 9                | 5（0/2/4/6/8）|
| icon button   | 96     | **5**             | 28、29、30、35、36                         | 2                | 3           |
| 輸入/select   | 48     | **10**            | 37、17、36、39、35、114...（含 textarea）  | 4                | 1           |
| tab/分段      | 12     | 1                 | 36                                        | 1                | 1           |
| chip/badge    | 80     | 3                 | 24、23、55                                | 3                | 3（2/6/999）|
| 卡片          | 73     | 3                 | 44、192（agent card）、184                | 3                | 4           |
| 清單列        | 52     | 6                 | 36、38、19、69、70、81                    | 3                | 1           |
| 段落標題      | 124    | 字級 **7 種**     | 13/14/16/18/20/28 與 12                    | n/a              | n/a         |

手機（觸控）：文字按鈕 9 種高度（36 與 40 為主，另有 62/55 多行），輸入 5 種（40 為主）；平板：icon button 36（67/68），按鈕 7 種。**觸控層比桌面一致**（36/40 規則生效），桌面層最發散。

規則檢查：

| 檢查                    | 結果                                                                                                              |
| ----------------------- | ----------------------------------------------------------------------------------------------------------------- |
| 觸控目標 < 36           | 手機 0（只有 `input[type=checkbox]` 22×22，靠整列延伸）；平板同                                                    |
| 滑鼠目標 < 32           | **桌面每頁都有 4 到 5 個**：icon-button 30×30 與 29×29（頂欄「在手機上開啟」、側欄收合、新增專案）、`select` 專案 154×17、登出 155×22、`.secondary` 114×26、辦公室 3D/2D 切換 64×30、畫質 select 46×19 |
| 字級 < 11px             | 全部情境 0                                                                                                        |
| 多行本文 line-height < 1.3 | 0（實測多行 1.6）。注意：1.0/1.2/1.25 僅用於單行元素                                                             |
| 本文字級分佈（桌面）     | 11px 467、12px 651、13px 182、14px 43、16px 38、18px 25、20px 14、28px 14：**12px 與 11px 是主體，14px 本文只有 43 處** |
| axe wcag2a/aa/21aa      | 14 頁 × 桌面/手機/平板 × 兩主題：**0 違規**。覆蓋 `e2e/ui-sweep.spec.ts`（14 頁、兩主題、桌面與手機）；不含對話框、KPI、快速開啟、sheet 展開狀態 |
| 對比（自行計算）        | 無真實失敗。light 的偵測值（`收合` 1.9、登入 `AETHER` 1.01）是因我的探測不處理漸層與深色玻璃底，視為誤報，須人工在 3D 場景上抽查 |
| 焦點環                  | 主路徑一致（2px mint，offset 4px，`base.css:33,40`）；變體 4 種：`.nav-link` 1px 38% 透明 offset -1px、`input` offset -1px、`.panel-resizer` outline none + 3px 背景、`.table-scroll/.history-table` 瀏覽器預設 `auto 1px`（手機深色上是 `rgb(238,238,238)` 淡灰） |
| 水平溢出                | 全部 0                                                                                                            |
| 雙重捲軸                | `messages` 頁有 `select` 內嵌捲動、`office-2d` 容器內捲動（皆為預期的內容捲動；無頁面級雙軸）                      |
| 截斷無 ellipsis         | 偵測 0；手機頂欄品牌名「AETHER · 軌道研究...」被硬切（截圖，`phone-drawer.css:3-6` 的 `.brand > span`）           |
| z-index                 | 桌面 2/10/13/15/22/30，手機 16/30/40；皆在 token 範圍，無衝突                                                      |
| safe-area               | `var(--safe-*)` 用於 phone-drawer 10、phone-sheet 7 等 9 檔；`index.html` 需確認 `viewport-fit=cover`（未驗證）      |

### 2.6 視覺不一致（看過截圖）

1. **平板「任務」頁標題列**（`tasks-tablet-dark.png`）：標題「任務」、次要按鈕「從模板啟動工作流程」、主按鈕「建立任務」三個子元素在 `.page-heading`（`pages.css:4-9`，`justify-content: space-between`）下，次要按鈕被擠到中間，與主按鈕不相鄰，且不與標題底線對齊。其他頁標題只有 2 個子元素，所以沒暴露。
2. **連接手機對話框**（`dialog-connect-dark.png`，`pages.css:118-133` `.pair-codes`）：「剩餘 4:59」浮在右上、與「手機連線的位址」label 不同基線；select 35px 高、「重新產生」按鈕 37px 高、QR 下方連結為第三種字級，三者間距不是同一個節奏。
3. **KPI 儀表板**（`kpi-desktop-dark.png`，`kpi.css:189-203`）：tile 網格（`gap: 8`）與其下的說明 `.kpi-empty` 之間 4px，而相鄰區塊 `額度視窗`、`GIT 活動` 之間是 20px 以上；`.kpi-note` 用 `margin-top: 16` 而 `.kpi-empty` 是 `margin: 0`，同一種「說明文字」兩套間距。
4. **3D 場景工具列**（`office3d-desktop-dark.png`，`scene-hud.css`）：右上「低」select 與 4 個 icon 按鈕為 35/36px，樓層面板內的「收合」34px、「分層展開/自動/操作」36px、「重播開場導覽」寬鈕 30px，邊框與圓角各自不同。
5. **手機 3D 辦公室**（`office3d-phone-dark.png`）：頂部三個 KPI chip（今日 TOKEN / 執行中 / 今日提交）橫向捲動且右緣被切（`kpi.css:596-616` scroll-snap），沒有淡出提示；頂欄品牌名硬切。
6. **登入頁焦點環**（`login-390-light.png`）：輸入框同時有 2px 環與自身 1px 邊框，視覺像雙框（`input` offset -1px，`base.css`）。

### 2.7 元件重複實作

| 模式       | 實作數 | 位置                                                                                                                 | 應收斂為                             |
| ---------- | ------ | -------------------------------------------------------------------------------------------------------------------- | ------------------------------------ |
| 區塊標題   | 9      | `page-heading`（13 處用）、`office-heading`、`panel-head`、`kpi-head`、`conv-header`、`notice-head`、`squad-strip-head`、`permission-head`、`modal-heading` | `.u-head` 共用類別 + `PageHeading`   |
| 空狀態     | 8      | `Empty`（13 處用）+ `kpi-empty`（6）、`sheet-empty`、`feed-empty`、`empty-state`、`empty-orbit`、`composer-menu-empty`、`clock-out-empty` | `Empty`（`ui.tsx:173`）+ `.u-empty`  |
| 開關       | 5      | `switch`、`sform-switch`、`view-switch`、`squad-toggle`、`long-toggle`                                                | `.u-switch`、`.u-segmented`          |
| chip/badge | 12+    | `Badge`（21 處）+ `squad-chip`、`relation-chip`、`model-chip`、`chip-meta`、`schip-*`、`peek-chips`...               | `.u-chip` + 變體                     |
| 對話框     | 1 個 `Modal`（13 處）+ `Sheet`（4）| 只有 `ui.tsx` 有 `role="dialog"`，這部分集中得好                                                          | 保留                                 |
| 載入、錯誤 | 載入 4 種（`scene-loading`、`skeleton`...）；錯誤只靠 `.state-error`（`controls.css:40`），無共用元件 | 補 `.u-error`、`.u-loading`                                  |
| 表單列     | `Field`（`ui.tsx:222`）與 settings `srow`（`settings-kit.css`）兩套                                                   | 保留兩者但共用 `--row-*` token       |

i18n 溢出：英文 `Open on your phone`、`New project` 等較中文長 2 到 3 倍；英文情境桌面 4 頁 overflow 0、截斷 0，但最長字串靠 `min-width` 與 `flex-wrap` 撐住（按鈕高度出現 192 的是卡片類按鈕換行）。未測德文式更長語系與 320px 寬。

### 2.8 CSS 組織、偏好、RTL、文件

- 檔案大小：52 檔，總 10308 行；> 400 行：`kpi.css` 649、`squad.css` 446；沒有 > 800（符合）。`docs/design-system.md` 1065 行已超過 800 行規則。
- 死 CSS：571 個 class 名中 34 個在 TS/TSX 找不到字串，**全部是動態組合**（`state-${}`、`seg-${key}`、`bucket-${}`、`level-N`）。結論：**實質死 CSS ≈ 0**，信心中等（子字串比對偏寬鬆，可能漏掉「名稱碰巧是別字串子集」的死 class）。
- 使用偏好：`prefers-reduced-motion` 9 檔、`@container` 8 處（panel 與 settings，用得好）、`clamp()` 0、`@layer` 0、`@supports` 0、`prefers-color-scheme` 0（由 `data-theme` 與 JS 決定）、`forced-colors` 0、`prefers-contrast` 0、`prefers-reduced-transparency` 0。`backdrop-filter` 44 處、`color-mix` 62 處，全都沒有透明度或強制色降級路徑。
- 邏輯屬性：物理 163（`left/right` 88、`text-align:left|right` 23、`margin-left|right` 27、`padding-left|right` 14、`border-left|right` 10）對邏輯 18（`padding-inline` 13、`padding/margin-block` 4、`margin-inline` 1）。
- 其他：`100vh` 類 `50vh/60vh` 三處（`quick-open.css:5`、`breakpoints.css:140`、`views.css:285`）違反「只用 dvh」；`phone-office.css:6` 的 `--tabbar-h` 在 token 之外。
- 文件抽樣 15 條：

| #  | 文件宣稱                                                     | 實際                                                                 | 判定 |
| -- | ------------------------------------------------------------ | -------------------------------------------------------------------- | ---- |
| 1  | tokens.css 是唯一允許字面值的檔                              | 屬實；但 `phone-office.css:6` 自訂屬性可繞過                          | 部分 |
| 2  | lint 在任何其他位置的字面值都失敗                            | 只涵蓋 5 類屬性（見 2.2）                                             | 漂移 |
| 3  | 本文 14px                                                    | `body` 13px（`base.css:19`）、實際文字以 11/12px 為主                  | 漂移 |
| 4  | 表單欄位手機 16px                                            | 手機輸入實測 16px（36 個）                                            | 準確 |
| 5  | 觸控按鈕 40、icon/chip 36、點擊 44                           | 手機 36/40 實測成立                                                   | 準確 |
| 6  | 滑鼠至少 32                                                  | 桌面多處 17 到 30                                                     | 漂移 |
| 7  | 只用 `100dvh`，不用 `100vh`                                   | `vh` 3 處                                                             | 漂移 |
| 8  | 無 < 11px 文字                                               | 全情境 0                                                              | 準確 |
| 9  | 動態只用 `--dur-fast --dur --ease`                           | 28 條字面秒數                                                         | 漂移 |
| 10 | 無限動畫只動 transform/opacity                               | 抽查符合（例外在 changelog）                                          | 準確 |
| 11 | 手機 sheet 56dvh                                             | `phone-sheet.css:135` 52dvh                                           | 漂移 |
| 12 | 共用元件 `Modal Sheet Fold Hint Clamp Field Badge Empty PageHeading` | 全存在於 `ui.tsx`                                                  | 準確 |
| 13 | 按鈕類別 `primary secondary icon-button text-button`         | 存在，另有 `button:not([class])` 隱式按鈕                              | 準確 |
| 14 | 面板寬度 320 到 720 與 container query                        | `session-panel.css` container 與 `panel-resize.css` 符合              | 準確 |
| 15 | 設計 token 檔路徑 `apps/web/src/tokens.css`（lint 檔頭註解）  | 實際 `styles/tokens.css`                                              | 漂移 |

## 修正狀態（Track A 到 F 合併後）

| 第 3 節問題                                  | 狀態 | 說明                                                                                                                                  |
| -------------------------------------------- | ---- | ------------------------------------------------------------------------------------------------------------------------------------- |
| P0 按鈕與 icon 沒有共用高度                  | 已修 | `--control-h-*` 加共用類別；手機 `breakpoints.css` 的 36px 強制已刪，`--control-touch*` 改用 `--control-h-*`；`role-variance` 全頁無排除 |
| P0 lint 不涵蓋 width/height/@media/自訂屬性  | 已修 | `scripts/design-token-rules.mjs` 八條規則加 `design-token-baseline.json`（只降不升）、逃生註解 `/* token-lint: <原因> */`、單元測試    |
| P1 標題列、空狀態、標題、開關                | 已修 | Track B/C（`.u-head`、`.u-empty`、`.u-switch`）                                                                                        |
| P1 本文字級                                  | 已修 | Track A（文件與 token 一致）                                                                                                          |
| P1 焦點環 4 種變體                           | 已修 | Track A/B/D/E（`--focus-ring` 單一規則）；forced-colors 下為 3px `Highlight`                                                          |
| P2 forced-colors、prefers-contrast、reduced-transparency | 已修 | `breakpoints.css` 末尾與 `tokens.css`；`e2e/preferences.spec.ts` 用 `emulateMedia` 驗證並存截圖                                       |
| P2 物理屬性 163 處（RTL）                    | 未做 | 排在最後的 Track G，機械式替換，不在本輪                                                                                              |
| P2 line-height、radius 角色                  | 已修 | `--lh-*`、`--r-control/card/sheet`；字面 line-height 剩 0（2 條單行字符以逃生註解標 `glyph`）                                         |
| P2 動態字面秒數、陰影字面                    | 已修 | 短轉場用 `--dur*`，陰影用 `--shadow-sm/md/lg/up`；剩餘的循環動畫、發光與外框以逃生註解標 `loop`/`animation`/`glow`/`ring`/`shadow`    |
| P3 `vh`、`--tabbar-h`、`kpi.css` 拆檔        | 已修 | `vh` 0；`--tabbar-h` 只在 `tokens.css`；`kpi.css` 與 `kpi-charts.css` 兩檔                                                            |
| P3 `design-system.md` 漂移                   | 部分 | 新增斷點、偏好查詢、lint 規則與基準線章節；整份自動產生與拆檔未做                                                                      |
| 斷點 16 種                                   | 已修 | `@media` 只用 760/1000/1250 寬與 500 高；4 個量測出的元件門檻列在 `MEDIA_EXCEPTIONS`，其餘改 container query 或合併                     |
| `!important` 5 處                            | 已修 | 剩 0 條計入；5 條使用者偏好（reduced-motion、reduced-transparency）以 `token-lint: preference` 標註                                    |

## 3. 優先序問題清單

| 優先 | 問題                                                    | 證據                                         | 使用者影響                                  | 修法                                                                          |
| ---- | ------------------------------------------------------- | -------------------------------------------- | ------------------------------------------- | ----------------------------------------------------------------------------- |
| P0   | 桌面按鈕與 icon 沒有共用高度，違反 32px 規則            | 2.5：12 種高度；29/30/22/17px                | 滑鼠與觸控板選取不準，頂欄看起來高低不一    | `--control-h-sm/md/lg` 加上 `.u-btn` 規格，`controls.css` 一次定義             |
| P0   | lint 不涵蓋 width/height/inset/line-height/@media/自訂屬性 | 2.2                                       | 發散會持續累積                              | 擴充 lint（第 5 節 Track F）                                                  |
| P1   | 標題列多於 2 個子元素時排版崩（任務頁）                 | `pages.css:4`，截圖                          | 次要動作離開主動作、基線不齊                | `.u-head` 兩區結構（標題區、動作區 `flex-wrap` + gap）                         |
| P1   | 空狀態、標題、開關各 5 到 9 種實作                      | 2.7                                          | 新頁面不知道用哪個；視覺有細微差異          | 收斂成共用類別                                                                |
| P1   | 本文實際 11/12px，文件說 14px，`body` 13px              | 2.5 字級分佈                                 | 中文長文可讀性、與文件互相矛盾               | 決定產品字級（建議本文 14，輔助 12，標籤 11）後調整 token 與文件               |
| P1   | 焦點環 4 種變體，含瀏覽器預設淡灰                       | 2.5                                          | 鍵盤使用者在表格與縮放條上看不到焦點        | `--focus-ring` token + 單一規則，移除 offset -1px 特例                         |
| P2   | 無 forced-colors、prefers-contrast、reduced-transparency | 2.8                                         | Windows 高對比、低視力、省電使用者          | 加三個 `@media` 區塊（`base.css` 層級）                                        |
| P2   | 物理屬性 163 處                                         | 2.8                                          | 未來 RTL 或直書要重寫                       | 機械式替換為邏輯屬性（不影響 LTR 結果）                                         |
| P2   | line-height 12 種、radius 角色混用                      | 2.3、2.4                                     | 文字節奏不統一                              | `--lh-*` 4 檔、角色 radius token                                              |
| P2   | 動態字面秒數 28 條、陰影字面 29 條                      | 2.1                                          | 動態節奏不一致                              | `--dur-slow`、`--shadow-sm/md/lg`                                             |
| P3   | `vh` 3 處、`--tabbar-h` 在 token 外、`kpi.css` 649 行    | 2.8                                          | 手機網址列伸縮時跳動                        | 換 `dvh`、搬進 tokens、`kpi.css` 拆兩檔                                        |
| P3   | `docs/design-system.md` 1065 行與 6 條漂移               | 2.8                                          | 新人被誤導                                  | 以 token 表自動產生數值，拆檔                                                  |

## 4. 建議的規格

### 4.1 刻度（沿用，補不足；不新增新風格）

- 間距：保留現有 `--space-2..64`。**規則**：padding/gap 只用 `4/8/12/16/24/32`，2 與 6 僅限元件內部微調（chip、badge、icon 內距），`20/40/48/64` 僅限版面。
- 控制項高度（新增，取代 `--control-touch*`/`--target-*` 的雙重用途）：

| token             | 桌面 | 觸控 | 用於                         |
| ----------------- | ---- | ---- | ---------------------------- |
| `--control-h-sm`  | 28   | 36   | icon button、chip、segmented |
| `--control-h-md`  | 32   | 40   | 按鈕、輸入、select           |
| `--control-h-lg`  | 40   | 44   | 主要 CTA、登入               |
| `--bar-h`         | 56   | 56   | 頂欄、tab bar、抽屜標頭      |

  `.icon-button`、`.text-button` 加上 `min-height: var(--control-h-sm)`（桌面達 28 仍低於 32，建議 sm 直接取 32，觸控取 36；見 6 未驗證）。
- 圓角語意：`--r-control`(= `--r-sm` 4)、`--r-card`(= `--r-lg` 8)、`--r-sheet`(= `--r-2xl` 16)、`--r-pill`。移除按鈕 `--r-xs` 與 `--r-md` 混用（`.primary` 的切角 clip-path 保留）。
- 字級：本文 `--fs-body` 14，輔助 `--fs-small` 12，標籤 `--fs-label` 11，`--fs-meta`(13) 併入 body 或 small（需設計決定）。
- 行高：`--lh-tight 1.25`（標題/單行）、`--lh-snug 1.45`（卡片文字）、`--lh-body 1.6`（長文），其餘 12 種字面值映射到這三個。
- 動態與陰影：`--dur-slow 0.4s`；`--shadow-sm/md/lg`。
- 斷點：`--bp-phone 760`、`--bp-tablet 1000`、`--bp-wide 1250`（CSS 不能在 `@media` 用 var，所以以 lint 白名單強制，只允許 760/1000/1250/500 高 4 個值）。
- 分層：primitive（現有色與間距）→ semantic（`--surface-card`、`--text-muted`、`--control-h-md`）→ component（只在元件檔內，如 `--btn-pad`）。第一階段只加 semantic 的尺寸類，顏色不動。

### 4.2 共用類別（10 個，前綴 `u-`）

`.u-btn`（+`--primary/--ghost/--icon`）、`.u-field`、`.u-chip`、`.u-card`、`.u-row`、`.u-head`、`.u-empty`、`.u-switch`、`.u-segmented`、`.u-sheet`（含 modal 與 drawer 的 padding/圓角）。現有 `.primary/.secondary/.icon-button/.text-button` 保留為別名（`@extend` 以並列選擇器）以免一次大改。

### 4.3 前後對照

1. **按鈕**。前：`controls.css:46-56` `padding: 8 12; font-size: small; radius: --r-xs; min-height: 35px`，觸控另在 `touch-targets.css:25` 改 40。後：`.u-btn { min-height: var(--control-h-md); padding-inline: var(--space-12); border-radius: var(--r-control); }`，觸控只在 token 層切換值（`:root` 的 `@media (pointer: coarse)`），不再重寫選擇器。
2. **icon 按鈕**。前：`controls.css:81-88` `padding: 6`，無 min-height（桌面 29/30）。後：`.u-btn--icon { inline-size: var(--control-h-sm); block-size: var(--control-h-sm); padding: 0; }`。
3. **標題列**。前：`pages.css:4` 單一 flex，子元素 > 2 時錯位。後：`.u-head { display: flex; flex-wrap: wrap; align-items: end; justify-content: space-between; gap: var(--space-12) var(--space-20); } .u-head__actions { display: flex; flex-wrap: wrap; gap: var(--space-8); margin-inline-start: auto; }`。

## 5. 平行修正計畫

### 規則與驗證（所有 track 共用）

- 驗證：`pnpm lint`、`pnpm format:check`、`pnpm typecheck`、`pnpm test`、`pnpm build`、`pnpm exec playwright test`，並在 390×844 與 820×1180 看過改動頁。
- 新增 `e2e/role-variance.spec.ts`：對 14 頁在桌面與手機量測，**同角色 distinct 高度上限**：按鈕 ≤ 3（含單行/兩種觸控）、icon button ≤ 1（在每個斷點內）、輸入 ≤ 2、tab/分段 = 1、chip ≤ 2，超過即失敗。腳本骨架即本稽核的 `measure.mjs` 的 `probe`。
- 擴充 `check-design-tokens.mjs` 的新規則：（a）`width/height/min-*/max-*/inset/top/left/right/bottom` 的字面 px 需在白名單（`0`、`1px`、`100%`、`auto` 與明列的例外檔案行）；（b）`line-height` 必須用 `--lh-*`；（c）`@media` 內 px 只允許 4 個斷點；（d）`--x: 12px` 自訂屬性在 tokens.css 以外要報錯；（e）`transition/animation` 時間要用 `--dur*`；（f）`vh` 報錯。以「基準檔」`scripts/design-token-baseline.json` 記錄現有違規數，只允許下降，各 track 完成時下調。
- 螢幕截圖檢查：沿用 `ui-sweep.spec.ts` 的 `evidence/screenshots`，各 track 附前後對照。

### Track 分工（檔案互不重疊）

| Track | 範圍                                                                                                         | 擁有的檔案                                                                                                                                                                         | 規則                                                                                                                 | 證明                                          |
| ----- | ------------------------------------------------------------------------------------------------------------ | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | -------------------------------------------------------------------------------------------------------------------- | --------------------------------------------- |
| A     | token 與基礎：新增 `--control-h-*`、`--bar-h`、`--lh-*`、`--dur-slow`、`--shadow-*`、`--focus-ring`；修 `--dim` light 重複；焦點環統一 | `tokens.css`、`base.css`、`index.css`                                                                                                                                              | 只新增，不改既有值；焦點環單一規則                                                                                   | lint 通過、axe 0、焦點環 Tab 探測只剩 1 種     |
| B     | 控制項與共用類別：按鈕、icon、輸入、chip、row、head、empty、switch、segmented；`ui.tsx` 對應調整             | `controls.css`、`forms.css`、`pages.css`、`folds.css`、`touch-targets.css`、`apps/web/src/ui.tsx`                                                                                  | 套 4.1 與 4.2；觸控切換改為 token 值切換；標題列兩區結構                                                             | role-variance spec（按鈕 ≤ 3、icon = 1）       |
| C     | 外框與頁面：頂欄、側欄、設定、頁面、KPI                                                                      | `shell.css`、`settings-kit.css`、`settings-content.css`、`settings-layout.css`、`kpi.css`（拆成 `kpi.css` 與 `kpi-charts.css`）、`views.css`、`login.css`、`sessions.css`            | 用 B 的類別；移除字面高度；`vh` 改 `dvh`；KPI 說明文字間距統一                                                       | 對應頁截圖、`vh` lint 為 0                    |
| D     | 場景與浮層：HUD、工具列、name-tag、角色選單、speech、overlays                                                | `office.css`、`scene-*.css`、`name-tag.css`、`character-menu.css`、`telemetry.css`、`workbench.css`                                                                                | 工具列控制項改用 `--control-h-*`；陰影與秒數 token 化                                                                | 3D 頁截圖、字面秒數與陰影為 0                 |
| E     | 對話與面板：session panel、feed、transcript、composer、squad、permission card、git                          | `session-panel.css`、`panel-resize.css`、`session-feed.css`、`squad.css`、`transcript*.css`、`composer.css`、`permission-card.css`、`git.css`、`models.css`、`clock-out.css`、`quick-open.css` | line-height 映射到 `--lh-*`；移除 `em` 字級；空狀態用 `.u-empty`                                                    | session-panel 與 squad 既有 e2e、截圖          |
| F     | 手機與響應式層、偏好與 lint                                                                                  | `breakpoints.css`、`compact-desktop.css`、`phone-*.css`、`scripts/check-design-tokens.mjs`、`e2e/role-variance.spec.ts`、`docs/design-system.md`                                   | 斷點只用 4 值；加 `forced-colors`、`prefers-contrast`、`prefers-reduced-transparency`；`--tabbar-h` 搬到 A（回報給 A）| 新 lint 與 spec；`responsive.spec.ts` 仍過    |

另一條可選的獨立軌道 G（RTL 邏輯屬性）會碰所有 CSS 檔，**必須排在最後**，用機械式替換單獨一個提交。

### 合併順序

A（只新增 token，最小衝突）→ B（共用類別，下游依賴）→ C、D、E 平行（檔案不重疊）→ F（含 lint 基準下調與文件）→ G（RTL，單獨，最後）。F 的 lint 規則在 C、D、E 完成後才啟用「禁止」模式；在此之前是「基準檔只降不升」。

## 6. 不要動的好東西

- 刻度本身與 lint 的現有 5 條規則（padding/gap/font-size/radius 99% 走 token，這是少見的紀律）。
- `Modal`/`Sheet` 單一實作，唯一的 `role="dialog"`。
- 觸控分層（36/40 繪製、44 命中區延伸，手機實測 0 違規）。
- 層級 token（17 級命名有序，頁面實測無衝突）。
- 場景玻璃與 `--on-glass*` 的「兩主題相同夜景」設計與 `prefers-reduced-motion` 處理、`@container` 的面板設計。
- axe 與 `responsive.spec.ts`（320 到 1366 與橫向手機）的覆蓋。
- 動畫只動 transform/opacity 的規則與切角 `.primary` 的品牌造型。

## 7. 我沒能驗證的部分

- 真機 iOS Safari 與 `viewport-fit=cover`、notch/home bar 實際 inset（只在桌面 Chrome 模擬 390×844）。
- 3D 場景疊在動態畫面上的真實對比（探測不處理漸層與 canvas）。
- 對話框狀態只量到「連接手機」「快速開啟」「KPI」；Sheet 的三個高度、角色選單、權限卡、任務表單、`Terminals`/`TaskDag` 的實際頁面尺寸未逐一量測。手機抽屜（`drawer`）按鈕我的選擇器沒點到，未取得量測。
- 320px 寬與較長語系；Settings 內每個群組只在單頁連續捲動的狀態量測，未分別截圖。
- 死 CSS 為字串比對，非 coverage；沒有用瀏覽器 CSS coverage 跑過。
- light 主題下 3D 面板的真實對比；`--terminal-bg` 在 light 主題是否為刻意深色未確認。
- 桌面按鈕與 icon 的「應該幾 px」是設計決策（28、32 或 36），建議值需維護者拍板。
