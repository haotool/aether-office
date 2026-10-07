/** The models words, in Traditional Chinese. */
export const zhModels = {
  modelsDetected: '偵測到的模型',
  modelsNote:
    '讀取本機 Claude Code 與 Codex 的快取。Codex 的快取過期時，會執行 `codex debug models` 列出模型（不會啟動任何模型工作階段）。不會寫入任何檔案。',
  modelsEffort: '推理強度',
  modelsEffortDefault: '預設',
  modelsRefresh: '重新整理',
  modelsNone: '找不到模型清單',
  modelsAlias: '別名：該系列最新的模型',
  modelsSourceCache: '來自 CLI 快取',
  modelsSourceCli: '來自 CLI',
  modelsSourceFallback: '僅內建別名',
  modelsStale: '資料已過時：開啟一次 CLI 即可更新',
} as const;
