# AETHER OFFICE

<p align="center">
  <strong>把 Claude Code 與 Codex 的工作，放進同一間辦公室。</strong><br />
  查看進度、閱讀對話，從瀏覽器或手機回應。
</p>

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

<img src="docs/images/office-overview-desktop.jpg" alt="AETHER OFFICE 的 3D 辦公室、Git 歷史與即時 session 面板" width="100%" />

_產品截圖使用合成示範資料。[截圖來源與重新產生方式](docs/images/README.md)。_

AETHER OFFICE 會發現電腦上已開啟的 coding session，讓每個 session 成為 3D 辦公室裡的角色。共用面板呈現對話、工具呼叫、token 用量與工作狀態；手機連上同一個 Wi-Fi，也能查看進度。

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

<details>
<summary><strong>查看對話面板與手機介面</strong></summary>

<img src="docs/images/session-conversation-desktop.jpg" alt="包含 Markdown、工具呼叫與子代理活動的對話面板" width="100%" />

<p align="center">
  <img src="docs/images/office-phone.jpg" alt="手機上的辦公室與權限批准卡片" width="240" />
  <img src="docs/images/sessions-phone.jpg" alt="手機底部抽屜的 session 列表" width="240" />
</p>

圖片中的 session 均為合成資料，用於展示介面，不代表真實提供者的驗證結果。

</details>

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
