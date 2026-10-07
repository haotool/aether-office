/** The connect words, in Traditional Chinese. */
export const zhConnect = {
  pairTitle: '連接手機',
  pairHint:
    '用手機相機掃描這個 QR code，就會直接登入，不必輸入權杖。每個 QR code 只能用一次，5 分鐘後失效；手機要和這台電腦在同一個網路。',
  pairOpen: '在手機上開啟',
  pairHttp: '這是純 HTTP：權杖與 QR code 在區域網路上沒有加密，只在你信任的網路使用。',
  advancedTitle: '進階功能',
  advancedHint:
    '顯示多 agent 編排用的頁面：任務、成果審查、團隊成員、知識庫、訊息、排程、執行主機、整合與工作區。只用終端機的 Claude Code / Codex 不需要；網址仍可直接開啟。',
  pairNoLan: '目前只允許本機連線。用 AETHER_HOST=0.0.0.0 重新啟動控制台，手機才連得到。',
  pairAddress: '手機連線的位址',
  pairPaired: '手機已連線',
  pairExpired: 'QR code 已失效，請重新產生。',
  pairExpiresIn: '剩餘',
  pairGenerate: '產生 QR code',
  pairAgain: '重新產生',
  pairing: '正在配對…',
  pairFailed: '配對碼已失效或已使用過，請在電腦上重新產生，或輸入權杖。',
  rememberDevice: '記住這台裝置 30 天',
} as const;
