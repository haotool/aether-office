# 專案知識與人類審核

知識庫以專案 ACL 隔離。提案保存作者、來源、版本、建立／更新時間，以及可選的 workId、artifactId、commitSha。工作與產物 ID 必須屬於同一專案；commitSha 只驗證格式，是「未驗證引用」，不證明該提交存在或測試通過。

在「知識庫」建立提案後，內容標示為 proposed。只有 owner 可填寫理由並批准或駁回，分類分別是 human_approved／rejected；agent、operator 與 viewer 不能自行批准。決策綁定 expectedVersion，重複的同一命令不會重複決策，已審核版本不能被另一個決策靜默覆寫。作者、審核者與理由會保留，事件和命令回條同交易提交。

MCP 的 propose_knowledge 只建立提案，並自動引用目前 session 的 workId。知識內容不會安裝 skill、執行命令、修改 RBAC 或自動取得工具批准。人類批准和測試證實是不同證據；目前沒有從引用字串自動產生「測試證實」分類的路徑。

搜尋支援繁體中文子字串。畫面呈現最近最多 100 筆符合條件的資料；完整大庫索引、內容修訂／撤回流程及測試證據分類仍待完成，不能把目前審核流程當成整份主規格已完成。

驗證：`tests/aether/knowledge.test.ts` 使用真 SQLite／HTTP route，涵蓋權限、引用 scope、版本、冪等、不可覆寫與繁中搜尋；`e2e/knowledge.spec.ts` 使用真瀏覽器測提案、批准、駁回、重載與可及性。
