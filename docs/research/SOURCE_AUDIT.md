# 來源查證與採用判斷

精確 commit、URL、license hash 與讀取範圍見 `SOURCES.json`。此文件是代表性模組查證，不是對各 repo 全部原始碼的認證。

- **agent-office**：MIT。實際 clone 並跑上游測試：在隔離 Node 24.21.0 得 444/444，typecheck passed。選定為 fork 起点。重用 `toon.ts` 的 rounded geometry/merge 核心及 Blender `aokit.py` 幾何/rig helpers。`queue.ts` 的 JSON best-effort persist、`muse.ts` 的 approval/sandbox bypass 不作新執行入口；new root scripts 只啟動 apps/ 下控制層。
- **Orca**：MIT。查閱 worktree-removal-safety、create-base、metadata ownership test。採納「來源 ownership 證明、root/home 保護、base identity」的設計方向，沒有引入 Electron／其內部 DB 作 runtime 依賴，也未聲稱跑過 Orca 全套測試。
- **Gas City**：MIT。實際查 `internal/events/events.go` 與 `recorder.go`。`Record` 是 best effort；`RecordAck` 成功僅保證可讀回，明確沒有 fsync stable-storage 保證。`engdocs/architecture/event-bus.md` 是較舊日期的架構說明，原始碼界線優先。本產品使用自己 SQLite FULL + transaction/outbox，沒有拿該 bus 假裝可靠訊息佇列。
- **Gas Town**：MIT。`internal/mail/store.go` 將 mail 映射到 beads storage，直接查 assignee、mark-read；delivery tests 把 pending/ack retry 分開。借鑑 delivery state 的分離，不複製無界查詢，也不導入 beads/Dolt runtime。
- **hcom**：MIT。`src/delivery.rs` 的 process-binding refresh 與 status fail-closed；`tests/send_delivery.rs` 驗 batch 邊界及游標進度。參考其 fail-closed 意義，不將 TCP/PTY 寫入或 cursor 前進稱為 Agent 理解內容；本產品 pending/history keyset 和每 recipient ACK 有自己的測試。
- **AI Maestro**：MIT。`lib/message-delivery.ts` 把 inbox persistence 與 verified wake 分開，`lib/agent-runtime.ts` 將 tmux 放在 interface 後。借鑑身份與喚醒分層；不依赖 tmux pane 文字或其私有 routes。
- **MCP Agent Mail**：實際 LICENSE 含 OpenAI/Anthropic Rider，不是純 MIT。停止進一步 source reuse／執行／依賴；僅記錄排除理由，未納入產品。

官方 interfaces：Codex 0.159.2 實際 generate-ts/JSON schema；Claude 2.1.286 help 和 Agent SDK 0.3.286 types（permission callback、query、session、tool_result）。相關 native synthetic tests 不是 live evidence。

Blender 5.2.2 LTS 從官方 release index 下載，SHA-256 已比對；使用自己隔離 app bundle，不改全域 Blender。glTF exporter 的 `get_socket_from_gltf_material_node` 與 node 名稱常數已讀，用於輸出真正 AO/PBR texture bindings。離線 Cycles 和 browser light rig 分開建置。
