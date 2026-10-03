# ADR-001：重新查證的開源底座

日期：2026-10-01。狀態：採用，驗證持續進行。

使用者最新指示改為從零 clone 開源專案，故不再等待歷史 0.3.0 ZIP，也不宣稱已修復該不存在的基線。舊規格的功能、安全、動物美術與交付門檻持續適用；舊 Python 移轉步驟改為本 fork 的逐步替換。

從 AgentSystemLabs/agent-office 的 `665aeec571bc03f76cbd16de8d628dd169a48874` 建立 `aether/product` 分支，保留完整上游檔案及 MIT 授權。Orca `373d951bf072698871c9e738ec2e1665ffd56830` 也已 clone 作來源比較。

原始碼證據：agent-office 的 `src/server/queue.ts` 用 JSON 檔並忽略 persist 例外；`src/server/muse.ts` 含略過 approval/sandbox 參數；`src/client/world/office.ts`、`toon.ts` 和 `src/shared/nav.ts` 提供實際空間、幾何與導航；Orca 的 `src/main/worktree-removal-safety.ts` 有 ownership、巢狀 worktree 與 home 保護，值得採用設計原則，但整個 runtime 綁較廣泛 desktop/relay 功能。

選擇：保留 agent-office 的可查證來源與可重用 3D/Blender 模組，在同 repo 建立規格要求的 TypeScript workspace 與單一 SQLite 控制層。上游 server 不接入新控制面的可執行入口；沒有權限繞過的 legacy 逃生通道。重用模組必須逐項做來源、資源生命週期和測試確認。

不把任一專案稱作已通過本產品需求的成熟成品；成熟度要由實際檢查界定。上游測試只證明其原範圍，不取代 AETHER 的 144 項驗收。
