# 開始使用

[文件索引](README.md) · [專案首頁](../README.zh-TW.md) · [English](getting-started.md)

<details>
<summary>目錄</summary>

- [環境需求](#環境需求)
- [五分鐘首次執行](#五分鐘首次執行)
- [試用示範模式](#試用示範模式)
- [即時模式：查看你自己的 session](#即時模式查看你自己的-session)
- [掃描 QR code 連接手機](#掃描-qr-code-連接手機)
- [從手機或平板開啟](#從手機或平板開啟)
- [升級](#升級)
- [擷取手機效能報告](#擷取手機效能報告)
- [安裝到手機](#安裝到手機)
- [受管理的執行（選用）](#受管理的執行選用)
- [下一步](#下一步)

</details>

## 環境需求

- Node.js **24.21.0**（`.nvmrc`）與 `package.json` 固定的 pnpm 版本。
- 受管理的終端機需要 macOS 或 Linux。終端機監督程式不支援原生 Windows。
- 選用：用於原生執行的 Claude Code 與（或）Codex CLI（見[提供者相容性](provider-compatibility.md)）；要修改動物角色則需要 Blender 5.2。

pnpm 內建的 `setup` 與 `doctor` 指令會蓋過同名的 package script，所以請執行本專案的 `pnpm run setup` 與 `pnpm run doctor`。`pnpm run doctor` 會回報你的作業系統、Node、pnpm、Git 與提供者 CLI 的版本。缺少 Claude Code 或 Codex CLI 只是警告（要開始 session 至少需要其中一個）；缺少 Git、pnpm，或原生模組無法載入，指令就會失敗。任何版本的 Claude Code 與 Codex 都能載入（沒有版本白名單）。`pnpm run doctor --strict` 連警告也視為失敗（供 CI 使用）。

## 五分鐘首次執行

給已經在終端機執行 `claude` 或 `codex`、想看看它們的人。

**一個指令：** `pnpm go` 會自動安裝、建置、啟動控制台（該連接埠已有控制台回應時則沿用），並在瀏覽器中開啟、直接登入。終端機也會印出同一條一次性登入連結：它只能用一次，五分鐘後失效，而且不會印出 owner token。`BROWSER=none` 不開啟瀏覽器，`BROWSER=<command>` 改用其他瀏覽器。以下的步驟是手動做同樣的事。

1. **安裝並建置**（約一分鐘；`pnpm start` 執行的是建置後的檔案，所以一定要先建置）：

   ```sh
   pnpm install --frozen-lockfile
   pnpm build
   ```

2. **啟動：**

   ```sh
   pnpm start
   ```

   第一次啟動會建立 `.data/live`，內含資料庫與 owner token，並印出 token 檔案的位置（不會印出內容）。`pnpm run setup` 做同樣的事但不啟動，可有可無。

3. **開啟 `http://127.0.0.1:4310`**（就是這個網址），把 token 檔案的內容貼進登入表單（`cat .data/live/owner-token`）。幾秒內，你最近的 session 就會以角色出現；右側面板依群組列出它們（需要你、工作中、已完成、閒置）。點一列即可閱讀對話。
4. **選用，取得精確狀態：** `pnpm hooks install --project /path/to/a/repo`（見[下方](#以-hooks-取得精確活動選用)）；已在執行的 Claude Code session 可能要重新啟動才會讀到新的 hook 設定。
5. **選用，連接手機：** `AETHER_HOST=0.0.0.0 pnpm start`，再掃描 QR code（見[連接手機](#掃描-qr-code-連接手機)）。

以上都不會啟動模型，也不會寫入 `~/.claude` 或 `~/.codex`。要停止，請在執行 `pnpm start` 的終端機按 Ctrl+C；你一直在觀察的 session 不受影響。

終端機訊息預設為英文；終端機語系是 `zh` 時為繁體中文（`AETHER_LANG=en` 或 `zh-TW` 可覆寫）。

## 試用示範模式

示範模式使用 fixture 資料，不需要你自己的 session。它執行的是開發伺服器，所以不需要先建置：

```sh
pnpm install --frozen-lockfile
pnpm demo
```

網頁介面在 `http://127.0.0.1:4311`；控制台與獨立的 fixture runner 使用連接埠 4310。任一連接埠被占用時，`pnpm demo` 會在啟動任何東西之前告訴你是哪一個；`PORT=4400 pnpm demo` 會把三者一起搬走（網頁介面此時在 4401）。終端機會印出 owner token 的存放位置（`.data/demo/owner-token`）。請讀取該本機檔案，把內容貼進登入表單。切勿分享 token。示範模式不使用付費模型，並把 fixture 的輸出標示為 fixture。

要改為執行建置後的檔案：

```sh
pnpm run setup --demo
AETHER_MODE=demo pnpm start
# in a second terminal
AETHER_MODE=demo node apps/runner/dist/main.js
```

建置後的介面此時由控制台在 `http://127.0.0.1:4310` 提供。

## 即時模式：查看你自己的 session

```sh
pnpm run setup        # creates the live data directory and the owner token
pnpm build
pnpm start            # AETHER_MODE defaults to live
```

開啟終端機印出的網址（`http://127.0.0.1:4310`）；`localhost:4310` 會被導向該網址，其他任何主機名稱都會被以 JSON `HOST_FORBIDDEN` 錯誤拒絕（主機檢查正是用來擋 DNS rebinding）。用 owner token 登入。這台機器上最近的 Claude Code 與 Codex session 會以被觀察到的角色出現。探索只讀取 session id、工作目錄、檔案時間與程序資訊，加上唯讀的 `git status`；對話文字只會在你開啟那個 session 時才讀取，而且從不儲存。即時模式本身只「觀察」：`pnpm run setup` 不會建立 runner 憑證，所以終端機頁、**Continue in AETHER**、輸入框與受管理的 agent 都維持不可用（介面會說明原因），直到用 `pnpm runner:enroll` 登記 runner，且它的原生設定檔開啟 `cliTerminals`（見[原生執行](native-execution.md)）。連結的 worktree 內的 session 會依儲存庫的 Git common directory 分組。設定 `AETHER_LOCAL_SESSIONS=off` 可停用探索。

### 以 hooks 取得精確活動（選用）

Hooks 讓 AETHER 知道 session 何時開始使用工具、等待核准或執行子代理：

```sh
pnpm hooks install --project /path/to/repo   # writes .claude/settings.local.json in that repository
pnpm hooks status  --project /path/to/repo
pnpm hooks remove  --project /path/to/repo
```

**`install` 會改什麼**，而且僅此而已：它會在專案的 `.claude/settings.local.json`（Claude Code 不納入 Git 的那個檔案）為每個事件加上一筆項目，原本檔案的副本會保留在旁邊，名為 `settings.local.json.aether-backup`。事件包括 `SessionStart`、`SessionEnd`、`UserPromptSubmit`、`PreToolUse`、`PostToolUse`、`PostToolUseFailure`、`SubagentStart`、`SubagentStop`、`Stop`、`PermissionRequest` 與 `Notification`，每一筆都執行本儲存庫的接收腳本，而它只會在 spool 檔案末尾附加一筆簡短紀錄。這些項目帶有標記，所以 `pnpm hooks status --project <dir>` 能回報它們，`pnpm hooks remove --project <dir>` 也只會移除這些。除非你傳入 `--scope user`，否則不會寫入任何使用者層級的設定。

加上 `--provider codex` 可使用 Codex 的 hooks（`.codex/hooks.json`；Codex 會要求你用 `/hooks` 信任它們）。

`--scope user` 會編輯 `~/.claude/settings.json`，影響這台機器上的每個 session；它絕不是預設值。接收器只記錄 session id、事件名稱、工具名稱、工作目錄，以及工具呼叫的簡短目標（檔案的 base name、指令的第一個字與像 `git push` 這樣的單純子指令、URL 的主機）、來自封閉清單的標籤（`test`、`build`、`git.push.force`、`fs.rm.recursive` 等：這是哪一類指令）與工具是否成功，寫入 `~/.aether/hook-events.jsonl`；絕不記錄提示、完整指令、參數、路徑、樣式或其他工具輸入。升級之後請再執行一次 `pnpm hooks install`，讓 Claude Code 也回報失敗的工具（在那之前 `pnpm hooks status` 會把 `PostToolUseFailure` 列為缺少）；沒有它的話，失敗的呼叫會維持「不明」，除非對話紀錄另有說明。

### 在瀏覽器回答 Claude Code 的權限提示（選用）

遠端批准預設關閉。要使用時，以 owner 登入、在設定中開啟它，再安裝額外的 hook：

```sh
pnpm hooks install --remote-approvals [--wait <seconds>]   # Claude Code only; default wait 45 s
```

之後權限提示也會以卡片顯示在 session 面板與手機上。在區域網路的純 HTTP 下用手機回答會被拒絕，除非你使用 HTTPS（例如 Tailscale 通道）或設定 `AETHER_REMOTE_APPROVALS_LAN=1`。完整模型見[安全性](security.md#safety-properties)。

## 掃描 QR code 連接手機

開啟區域網路存取後（見下一節），讓手機登入最快的方式是 QR code，而不是 token：

```sh
AETHER_HOST=0.0.0.0 pnpm start
pnpm run pair          # prints one QR code in the terminal
```

控制台以設定了 `AETHER_HOST` 的方式啟動時，也會印出同一個 QR code；頂部列的 **在手機上開啟** 按鈕可在任何頁面顯示它。用手機相機掃描（同一個 Wi-Fi）。QR code 指向的是這台電腦的最佳位址（真實網路介面上的 192.168.x 或 10.x 位址；通道、容器與 link-local 位址會略過），其他位址列在旁邊，並帶有同一組代碼。你也可以先在電腦上登入，再用頂部列的 **在手機上開啟**：它會顯示 QR code、讓你切換它指向的位址，並在手機使用過之後告訴你。代碼**只能使用一次**，**五分鐘**後失效；代碼放在連結的 fragment 中，瀏覽器不會把它經由網路送出，所以不會出現在任何伺服器日誌裡。手機會被記住 30 天。登入頁的「記住這台裝置」對手動輸入的 token 做同樣的事（否則 session 為期 8 小時）。

## 從手機或平板開啟

預設情況下，控制台只監聽這台機器。要從同一個網路上的另一台裝置使用：

```sh
AETHER_HOST=0.0.0.0 pnpm start
```

它會印出可以開啟的位址（例如 `http://192.0.2.20:4310`）。用同一個 owner token 登入。只有位址是同一連接埠上的私有網路位址的請求才會被接受，所以指向你這台機器的公開 DNS 名稱會被拒絕（這正是擋 DNS rebinding 的做法）。連線是純 HTTP，token 會不加密地經過網路：請使用你信任的網路，或在前面放一個 TLS 通道，例如 Tailscale。見[安全性](security.md)。

### macOS 登入服務

```sh
pnpm build
pnpm service install
```

會寫入 `~/Library/LaunchAgents/com.haotool.aether-office.plist` 並載入它：之後控制台會在登入時啟動，停止時自動重啟（間隔不短於 30 秒）。plist 會釘住執行這個指令的 Node（之後升級 Node 不會弄壞原生模組）與它所在的 checkout，也會保留你執行時的 `PATH`、`PORT`、`AETHER_HOST`、`AETHER_DATA_DIR`、`AETHER_TRUST_PROXY`、`AETHER_LANG`、`AETHER_HOME` 與 `AETHER_NATIVE_CONFIG`，所以 `AETHER_HOST=0.0.0.0 pnpm service install` 會把服務開放給你的網路；要改其中一項，請再執行一次 install。它會取代同一個 label 的既有服務。

輸出寫到 `~/Library/Logs/aether-office/control.log`。launchd 從不輪替日誌，所以控制台會在檔案超過 10 MiB 時把它移到 `control.log.1` 並清空。

`pnpm build` 會重啟從同一個 checkout 安裝的服務，所以更新就是 `git pull`、`pnpm install --frozen-lockfile`、`pnpm build`。`pnpm go` 會找到執行中的服務並開啟已登入的瀏覽器。`pnpm service uninstall` 會卸載並移除它，日誌則保留。僅限 macOS：在 Linux 請用你自己的 supervisor 執行 `pnpm start`。

## 升級

先 pull，再執行 `pnpm install --frozen-lockfile` 與 `pnpm build`，並**重新啟動控制台**（`pnpm start`；`pnpm build` 已經會重啟從這個 checkout 安裝的登入服務）。執行中的伺服器沿用它啟動時的程式碼，所以在重新啟動前，它會以舊的形式回應已更新的頁面。若更新涉及遠端批准，請在設定中把它關掉再開起來，並重新安裝 hook（`pnpm hooks install --remote-approvals`）；設定檔多了一個 `verifyKey`，在取得它之前 hook 會退回終端機的提示。

## 擷取手機效能報告

調查手機 PWA 卡頓時，維護者需要來自真實手機的數字。應用程式可以在本機產生 JSON 報告（不會上傳任何東西）。在網址加上 `?fieldperf=1` 即可選擇啟用（值必須恰為 `1`；場景的畫格探針仍另外使用 `?perf=N`）。沒有 `fieldperf=1` 時不會載入報告程式碼。

1. 在你的 Mac 上啟動控制台，讓手機連得到：`AETHER_HOST=0.0.0.0 pnpm start`（與[從手機或平板開啟](#從手機或平板開啟)相同）。
2. 在手機上（Safari 或 Chrome，或 **加入主畫面** 之後的主畫面圖示），開啟印出的位址並在後面加上 `/?fieldperf=1`（例如 `http://192.0.2.20:4310/?fieldperf=1`）。使用辦公室約兩分鐘：捲動動態、開啟一個 session、切換樓層。若要量冷啟動，請強制結束瀏覽器或已安裝的 App，再開啟同一個連結，使用約一分鐘。
3. 在小面板上點 **Copy report**（收集幾秒之後）。把 JSON 貼到 issue 或稽核證據中。瀏覽器量不到的欄位是 `null`，並列在 `unsupported` 之下。

JSON 包含完整的 **User-Agent** 字串（用於識別裝置與瀏覽器）、計時與 WebGL 探針欄位，以及 `/api` 的請求次數。它**不包含**專案名稱、對話文字、URL 路徑或帳號識別資訊。

## 安裝到手機

辦公室是可安裝的網頁應用程式：從主畫面開啟時它以全螢幕執行、有自己的圖示，捷徑（長按圖示）直接通往 Sessions 與 Approvals。

- **Android（Chrome、Edge、Samsung Internet）：** 頁面會顯示 **安裝** 按鈕，或使用瀏覽器選單的「安裝應用程式」。
- **iPhone 與 iPad（Safari）：** 點選「分享」，再點 **加入主畫面**。頁面會顯示這些步驟一次（關掉之後就不再出現）。iOS 沒有讓網頁呼叫的安裝按鈕。
- **桌面 Chrome 與 Edge：** 網址列上的安裝圖示。

**網路上的純 HTTP 無法安裝成完整的 App，也沒有離線外殼或更新提示。** Service worker（上述功能需要它，Web Push 也是）只能在_安全環境_（secure context）運作：`https://`，或 `localhost` / `127.0.0.1`。開啟 `http://192.0.2.20:4310` 的手機仍能使用整間辦公室（在 iOS 上加入主畫面也會給它圖示與全螢幕模式），但頁面不會註冊任何東西，也不會對此說什麼。要取得其餘功能，請用 HTTPS 提供辦公室：

控制台只接受位址為 `127.0.0.1:4310` 的請求，或在設定了 `AETHER_HOST` 時，位址為其自身連接埠上的私有網路位址的請求（DNS rebinding 防護，見[安全性](security.md)）。因此前面的 TLS 代理必須把請求以 `127.0.0.1:4310` 的樣子交給它。`tailscale serve` 本身沒有改寫 Host header 的設定（這裡沒有試過），所以請使用做得到的代理，例如 Caddy，並從適合你的來源取得憑證：

```
# Caddyfile: office.example, or <machine>.<tailnet>.ts.net with `tailscale cert`, or an address with mkcert
office.example {
  tls internal                       # or: tls /path/to/cert.pem /path/to/key.pem
  @own header Origin https://office.example
  handle @own {
    reverse_proxy 127.0.0.1:4310 {
      header_up Host 127.0.0.1:4310
      header_up Origin http://127.0.0.1:4310
    }
  }
  handle {
    reverse_proxy 127.0.0.1:4310 { header_up Host 127.0.0.1:4310 }
  }
}
```

如果代理與控制台在同一台機器上，請以 `AETHER_TRUST_PROXY=127.0.0.1` 啟動控制台（Caddy 會自己設定 `X-Forwarded-For` 與 `X-Forwarded-Proto`）：登入次數限制就會分別計算每個用戶端，session cookie 也會變成 `Secure`。`Origin` 的改寫只限於代理自己的位址，所以來自其他網站的請求仍帶著外來的 Origin，並像以前一樣被拒絕。（這份做法依據 Caddy 與控制台的程式碼寫成，尚未在這裡完整跑過一遍。）

| 憑證                              | 做法                                                                                                                                                                                                  | 取捨                                                              |
| --------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ----------------------------------------------------------------- |
| Caddy 自己的 CA（`tls internal`） | 在手機上信任 Caddy 的根憑證。                                                                                                                                                                         | 只在區域網路內可用；每支手機都要信任這個 CA。                     |
| mkcert                            | `mkcert -install`、`mkcert office.example`，把 `tls` 指向產生的檔案，將 `rootCA.pem`（`mkcert -CAROOT`）傳到手機並信任它（iOS：安裝描述檔，再到「設定」、「一般」、「關於本機」、「憑證信任設定」）。 | CA 金鑰必須保密。                                                 |
| Tailscale                         | 在管理主控台開啟 MagicDNS 與 HTTPS 憑證，執行 `tailscale cert <machine>.<tailnet>.ts.net`，把 `tls` 指向產生的檔案。                                                                                  | 公開信任的憑證，手機上不必安裝任何東西；只有你的 tailnet 連得到。 |

如果 service worker 出了問題，請用 `?sw=off` 開啟辦公室一次：該瀏覽器上的 worker 與它的快取會被移除，並維持關閉（`?sw=on` 可再開啟）。

## 受管理的執行（選用）

原生執行會在隔離的 Git worktree 中執行 Codex 或 Claude，由明確的指派啟動。它需要一份本機設定檔與逐專案的明確同意。見[原生執行](native-execution.md)與[設定](configuration.md)。在你指派工作之前，不會啟動任何付費模型。

## 下一步

- [架構](architecture.md)：各部分如何組合在一起。
- [開發](development.md)：參與貢獻。
