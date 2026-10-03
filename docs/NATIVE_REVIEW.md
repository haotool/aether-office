# 原生代理審查

成果審查頁可由 owner/operator 明確選擇另一位 Codex 或 Claude 代理啟動審查。執行仍要求專案 live policy 與 runner 本機 provider/repository 授權；按鈕可能使用已登入提供者額度。

work.request_review 綁定 work version、工程 head/base SHA、指定 reviewer 與來源 machine。審查 run 有獨立 purpose/session/branch/checkout，不增加工程 attempt，也不覆寫工程 result、submittedBy 或 head。自己不能審自己；仍有 active 或 indeterminate run 時不能再派工。固定 SHA 與版本不符的遲到審查只保留歷史事件，不套用決策。

Codex 使用 read-only sandbox 且禁止網路；Claude 僅開 Read/Glob/Grep 內建工具，兩者的審查執行皆拒絕權限提升。session MCP 僅允許訊息與知識提案的寫入，不能改任務或自授 review 權限。這些是平台及 provider 邊界，並非隔離同 OS 使用者的所有外部程序。

Runner 在獨立 checkout 前後檢查固定 head 與乾淨狀態，提供 base..head 的受限 patch（超過 60KB 拒絕），解析嚴格 JSON decision/body/headSha，然後透過原本 durable report 路徑送回。審查成功還需要控制台匹配身份、工作版本與 SHA；approve 只開放固定版本 verifier，不能直接完成任務。changes_requested 後仍由明確 retry 使用原工程工作區，受原 attempt 上限限制。

已驗證：真 SQLite 的 approve/changes_requested/stale/cancel/offline、session 限權；真 Git 的獨立 checkout 與工程 WIP 保留；合成 Codex app-server 的 read-only protocol；真 HTTP/control/runner/browser 串接退回修正、代理審查、verifier 和人類接受。合成程序不是付費模型，也不是雙 provider Live 證據。Claude 新審查配置只經型別/既有 adapter 測試，尚未跑新原生 Claude 審查；W1/W2 真雙 provider 與完整 workflow templates 仍待完成。
