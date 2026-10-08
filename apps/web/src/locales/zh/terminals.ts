/** The terminals words, in Traditional Chinese. */
export const zhTerminals = {
  terminalCommandState: '最近命令狀態',
  terminals: '終端機',
  terminalNote: '互動式 PTY；不把結構化日誌當成可操作終端機。',
  terminalReadOnly: '唯讀',
  terminalAgentWorking: '執行中',
  terminalAgentWaiting: '等你選擇',
  terminalAgentIdle: '待命',
  terminalControlled: '您已接管',
  terminalTakeover: '接管輸入',
  terminalRelease: '釋放接管',
  terminalStop: '停止終端機',
  terminalStart: '啟動終端機',
  terminalProfile: '本機批准的啟動設定',
  terminalNoProfileTitle: '還沒有可以開的終端機',
  terminalNoProfile:
    '尚無終端機設定。需要先連上執行主機（pnpm runner:enroll），並在它的 native 設定檔加上 "cliTerminals": true 或 "terminals" 項目，詳見 docs/native-execution.md。',
  terminalCols: '欄數',
  terminalRows: '列數',
  terminalResize: '調整尺寸',
  terminalGap: '較早輸出已截斷；畫面可能缺少先前 ANSI 狀態。',
  terminalInputNote: '輸入排入持久命令；寫入 PTY 不代表代理已理解。關閉此頁不會停止程序。',
} as const;
