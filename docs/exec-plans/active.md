# AETHER 產品化實作計畫

使用者授權：從全新開源 clone 獨立開發，不派子代理；未授權真付費模型或 remote 寫入。

1. 查證精確上游、授權、代表性源碼與可重現工具鏈。已 clone 七個來源；選定 agent-office fork，MIT 幾何 helper 已實際整合；保留上游 444 項測試。
2. 控制層垂直切片：SQLite 交易／權限／命令日誌／訊息／runner／實際 UI。已有可操作垂直切片；26 項本機測試、3 項真 browser E2E/axe 通過（包含 synthetic native workflow），仍需完整故障/負載覆蓋。
3. Git 工作區與受測 SHA 防護、持久批准、原生 Codex／Claude 協議、MCP、觀察與 PTY。Git/SHA、批准、native adapters、MCP、review→verify→accept 已接通；原生真模型未驗證；觀察與 PTY 尚未完成。
4. 完整 2D 操作台、DAG／模板／replay／editor／navigation／tour／i18n／a11y。已有部分頁面，需實際整頁 E2E。
5. 實際 Blender 八家族、rig/UV/PBR/LOD/14 clips、九區高品質空間、真 4K Cycles、音樂與 GPU 效能。現有程序化視覺是中途工程成果，非最終美術交付。
6. 遠端 runner、ACP、A2A、GitHub／Linear、知識/skills、排程/額度、備份還原、CLI、operations。
7. 故障與資安、乾淨封裝安裝、完整規格驗收／G0-G7 判定、交付 ZIP 與 checksum。

每一輪更新 FEATURES 的實作、驗證及 scope；沒有執行的測試不填 passed。出現失敗先定位根因，不弱化需求。
