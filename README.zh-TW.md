<img src="docs/images/readme-hero.zh-TW.webp" alt="AETHER OFFICE——軌道 A 標誌、繁中 3D 辦公室與對話、中央 Git 花及手機辦公室；真實介面使用合成示範資料" width="100%" />

<h1 align="center">讓你的程式代理，在同一間辦公室協作。</h1>

<p align="center">
  <a href="https://github.com/haotool/aether-office/actions/workflows/ci.yml"><img src="https://github.com/haotool/aether-office/actions/workflows/ci.yml/badge.svg" alt="CI 狀態" /></a>
  <a href="https://github.com/haotool/aether-office/releases"><img src="https://img.shields.io/github/v/release/haotool/aether-office?include_prereleases" alt="最新預發行版" /></a>
  <a href="LICENSE"><img src="https://img.shields.io/badge/license-MIT-blue.svg" alt="MIT 授權" /></a>
</p>

<p align="center">
  <a href="#快速開始">快速開始</a> ·
  <a href="docs/README.md">文件索引</a> ·
  <a href=".github/CONTRIBUTING.md">參與開發</a> ·
  <a href="README.md">English</a>
</p>

_首圖使用繁體中文實際介面與合成示範資料；中央 Git 花呈現儲存庫歷史。
[圖片來源與重製方式](docs/images/README.md#hero-provenance)。_

AETHER OFFICE 把 **Claude Code 與 Codex 的工作階段，帶進同一間本機 3D 辦公室**。不用切換多個終端機，就能查看誰正在工作、閱讀對話與工具呼叫，並追蹤子代理小隊。中央 Git 花隨儲存庫歷史生長，Token 與 Git 指標則呈現場景背後的活動。

手機連上可信任的 Wi-Fi，也能開啟同一間辦公室，離開桌面後繼續掌握進度。

服務在本機執行，不需要 AETHER 帳號或雲端服務。Claude Code、Codex 的登入憑證與訂閱仍由原本的 CLI 管理。

> [!IMPORTANT]
> **目前為預發行版（`0.4.x`）。** 部分能力仍只有部分驗證。用於重要工作前，請先閱讀
> [功能驗證台帳](docs/verification/report.md)與[支援範圍](#支援範圍與限制)。

## 可以做什麼

| 工作             | 能力                                                                             | 指南                                                                                                |
| ---------------- | -------------------------------------------------------------------------------- | --------------------------------------------------------------------------------------------------- |
| 追蹤 session     | 工作狀態、對話歷史、Markdown、可展開的工具呼叫與子代理小隊                       | [功能說明](docs/features.md)                                                                        |
| 回應 Claude Code | 明確啟用後的權限批准，以及受 AETHER 控制的 session 輸入；外部 session 起初為唯讀 | [遠端批准](docs/getting-started.md#answer-claude-code-permission-prompts-from-the-browser-optional) |
| 理解工作量       | Token 與 Git 指標、角色分層、辦公室裡的活動訊號                                  | [Session 角色](docs/roles.md)                                                                       |
| 使用手機         | 一次性 QR 配對、底部抽屜裡的 session 列表與對話                                  | [手機連線](docs/getting-started.md#open-it-from-a-phone-or-tablet)                                  |
| 管理執行         | 選用的 worktree、終端機、有限額任務、審查與固定 commit 驗證                      | [原生執行](docs/native-execution.md)                                                                |

## 快速開始

**需求：** Node.js **24.21.0**（`>=24.21.0 <25`）、pnpm **12.8.1**，以及 macOS 或 Linux。
版本固定在 `.nvmrc` 與 `package.json`；尚未安裝 pnpm 時，請先看[環境設定](docs/getting-started.md#requirements)。

```sh
git clone https://github.com/haotool/aether-office.git
cd aether-office
pnpm install --frozen-lockfile
pnpm build
pnpm start
```

開啟 **<http://127.0.0.1:4310>**，使用 owner token 登入。終端機會印出 token 的**檔案位置**，請妥善保管；主機驗證刻意拒絕 `localhost`，因此請使用上述完整網址。

第一次啟動會在 `.data/live` 建立資料庫與本機憑證。最近的 Claude Code、Codex session 會自動以觀察模式出現。[首次使用指南](docs/getting-started.md)。

### 試用示範模式

安裝依賴後執行：

```sh
pnpm demo
```

開啟 **<http://127.0.0.1:4311>**。示範模式使用 fixture 資料，不呼叫付費模型。

### 連接手機

在可信任的區域網路中執行：

```sh
AETHER_HOST=0.0.0.0 pnpm start
pnpm run pair
```

手機連上相同 Wi-Fi 後掃描 QR code。每個配對碼只能使用一次，五分鐘後失效。

> [!WARNING]
> 區域網路連線預設使用明文 HTTP，token 與 cookie 未加密傳送。遠端批准需要 HTTPS，或明確啟用區域網路選項；完整可安裝 App 與離線功能也需要安全來源。
> 請依照[手機與 HTTPS 指南](docs/getting-started.md#install-it-on-a-phone)設定。

### 加入工具活動與權限批准

Hooks 可補上 transcript 以外的工具結果、子代理活動與權限提示。

```sh
pnpm hooks install --project /path/to/repo
pnpm hooks install --project /path/to/repo --remote-approvals
```

安裝前請閱讀[會修改哪些檔案](docs/getting-started.md#exact-activity-with-hooks-optional)。遠端批准適用於 Claude Code；Codex 沒有相同的 hook 合約。

<details>
<summary><strong>查看多層樓遠景、Git 花冠、對話與手機畫面</strong></summary>

- [多層樓總覽](#多層樓總覽)
- [Git 花冠](#git-花冠)
- [即時對話與小隊](#即時對話與小隊)
- [Token 與 Git 儀表板](#token-與-git-儀表板)
- [手機四種工作畫面](#手機四種工作畫面)

### 多層樓總覽

保留原本的遠景圖，呈現多層樓辦公室與中央 Git 花的視覺關係。以下深、淺色總覽為較早拍攝的英語介面；後面的功能圖使用現行介面。

<img src="docs/images/office-overview-desktop.jpg" alt="既有深色多層樓遠景，呈現辦公室建築與中央 Git 花；較早的英語介面" width="100%" />

<img src="docs/images/office-overview-desktop-light.jpg" alt="既有淺色多層樓辦公室總覽；較早的英語介面" width="100%" />

### Git 花冠

Git 歷史在辦公室上方生長成花。這張既有花冠特寫也呈現了樓層分離展開的視角。

<img src="docs/images/office-crown-desktop.jpg" alt="既有 Git 花冠特寫，花朵位於分層展開的辦公室上方；較早的英語介面" width="100%" />

### 即時對話與小隊

在 3D 辦公室旁閱讀對話與可展開的工具結果，並查看主管、子代理活動連線及多鏡頭預覽。

<img src="docs/images/session-conversation-desktop.zh-TW.jpg" alt="繁中辦公室與對話面板，包含工具結果和子代理活動" width="100%" />

<img src="docs/images/squad-strings-desktop.zh-TW.jpg" alt="繁中小隊近景，呈現主管、四個子代理、活動連線及多鏡頭預覽" width="100%" />

### Token 與 Git 儀表板

<img src="docs/images/kpi-dashboard-desktop.zh-TW.jpg" alt="繁中 KPI 儀表板，呈現 Token 組成、每日用量、模型占比與 Git 活動" width="100%" />

### 手機四種工作畫面

**01 · 3D 辦公室 — 02 · Token 用量圖表**

<p align="center">
  <img src="docs/images/office-phone.zh-TW.jpg" alt="繁中手機 3D 辦公室，呈現工作中的子代理小隊近景" width="280" />
  <img src="docs/images/kpi-phone.zh-TW.jpg" alt="繁中手機 KPI 儀表板，呈現 Token 組成與每日活動圖表" width="280" />
</p>

**03 · 完整 session 列表 — 04 · 閱讀對話**

<p align="center">
  <img src="docs/images/sessions-list-phone.zh-TW.jpg" alt="繁中手機完整 session 列表，呈現工作名稱、提供者與工作狀態" width="280" />
  <img src="docs/images/conversation-phone.zh-TW.jpg" alt="繁中手機對話畫面，呈現需求、工具紀錄與代理回覆" width="280" />
</p>

工作範例均使用合成資料，介面截圖不代表真實提供者的驗證結果；示範對話保留原始內容語言。[完整圖片索引](docs/images/README.md)。

</details>

## 支援範圍與限制

| 項目         | 目前支援                                                                       |
| ------------ | ------------------------------------------------------------------------------ |
| Claude Code  | 2.1.x，已對照 2.1.289；hooks、子代理、模型目錄與選用的遠端批准                 |
| Codex CLI    | 已驗證的精確版本 0.159.2、0.160.0、0.160.1；未列出的版本會被拒絕               |
| macOS        | 已測試的瀏覽器平台；原生 Windows 終端機不受支援                                |
| Linux        | CI 執行安裝與單元測試；瀏覽器驗證範圍見[開發指南](docs/development.md#testing) |
| 外部 session | 起初為唯讀；符合條件的 session 可接續到 AETHER 的控制範圍                      |
| 權限         | 一位可信任的本機操作者；不提供多使用者隔離，也不隔離同帳號執行的程式           |
| 用量         | Token 數與已記錄的額度資訊；不提供模型價格表或金額估算                         |

ACP 代理與 A2A gateway 為選用能力。完整合約與升級方式見[提供者相容性](docs/provider-compatibility.md)。

## 架構

控制平面擁有 SQLite 資料庫，驗證身分並處理命令。唯讀 scanner 發現本機 session，再透過 server-sent events 通知網頁。選用 runner 從 API 領取工作、回報結果；瀏覽器在需要時載入 Three.js 場景。

| 目錄                                                        | 職責                                              |
| ----------------------------------------------------------- | ------------------------------------------------- |
| `apps/control`                                              | Fastify API、身分驗證、資料庫、session 發現與事件 |
| `apps/runner`                                               | 提供者程序、worktree 與終端機；不直接寫入資料庫   |
| `apps/web`                                                  | React 介面、session 面板與 App shell              |
| `packages/contracts`、`kernel`、`providers`、`office-scene` | 共用合約、領域規則、CLI adapter 與場景資產        |

[架構文件](docs/architecture.md)與[安全模型](docs/security.md)說明資料流及信任邊界。

## 文件

| 入門                                                          | 參考                                           | 專案                                |
| ------------------------------------------------------------- | ---------------------------------------------- | ----------------------------------- |
| [開始使用](docs/getting-started.md)                           | [設定](docs/configuration.md)                  | [貢獻指南](.github/CONTRIBUTING.md) |
| [操作指南](docs/how-to.md)                                    | [提供者相容性](docs/provider-compatibility.md) | [開發指南](docs/development.md)     |
| [功能說明](docs/features.md)                                  | [安全](docs/security.md)                       | [更新紀錄](CHANGELOG.md)            |
| [手機與 HTTPS](docs/getting-started.md#install-it-on-a-phone) | [功能驗證台帳](docs/verification/report.md)    | [架構決策](docs/adr/README.md)      |

[完整文件索引](docs/README.md)另涵蓋設計紀錄、效能量測、發布流程與授權。[English introduction](README.md)。

## 參與開發

歡迎可重現的錯誤回報與範圍明確的 pull request。請先閱讀[貢獻指南](.github/CONTRIBUTING.md)、
[行為準則](.github/CODE_OF_CONDUCT.md)與[開發指南](docs/development.md)。AI 輔助貢獻遵守相同的審查、驗證與授權規則；[AGENTS.md](AGENTS.md)記錄代理的專案邊界。

安全問題請依[SECURITY.md](.github/SECURITY.md)私下回報。設定問題與錯誤回報格式見[支援指南](.github/SUPPORT.md)。

## 授權與來源

[MIT](LICENSE)。Copyright (c) 2026 haotool。部分內容源自
[AgentSystemLabs/agent-office](https://github.com/AgentSystemLabs/agent-office)，copyright (c) 2026 AgentSystemLabs。
來源保留於 [NOTICE](NOTICE)、[provenance](docs/legal/provenance.md)與[第三方授權公告](docs/legal/THIRD_PARTY_NOTICES.md)。

AETHER OFFICE 是獨立專案，未與 Anthropic 或 OpenAI 建立隸屬、背書或贊助關係。Claude、Claude Code 為 Anthropic, PBC 的商標；Codex、OpenAI 為 OpenAI 的商標。其他商標屬於各自所有者。
