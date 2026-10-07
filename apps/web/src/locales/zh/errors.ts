/** The errors words, in Traditional Chinese. */
export const zhErrors = {
  errAuthRequired: '登入失敗或已過期。請確認存取權杖後再試一次。',
  errLoginRateLimit: '登入嘗試次數過多，請等一分鐘再試。',
  errForbidden: '你沒有執行這項操作的權限。',
  errLiveExecutionOff:
    '真實 agent 執行尚未開啟。請在設定開啟「允許真實 agent」，連上執行主機，並在它的 native 設定檔啟用（docs/native-execution.md）。',
  errTerminalProfile:
    '這個資料夾沒有終端機設定。請連上執行主機並開啟 cliTerminals（docs/native-execution.md）。',
  errNoRunner: '沒有連上的執行主機，無法啟動終端機。',
  errSessionNotFound: '找不到這個 session，清單會重新整理。',
  errSessionNotRunning: '這個 session 已不在執行。',
  errProcessChanged: '程序在你查看之後變了，請重新整理再試。',
  errSessionNotStale: '它又被使用了，所以沒有動它。',
  errLocalSessionsOff: '本機 session 偵測已關閉（AETHER_LOCAL_SESSIONS=off）。',
  errPairingInvalid: '這個配對碼錯誤、已使用或已過期，請重新產生。',
  errVersionConflict: '有人先改了這筆資料，請重新載入再試。',
  errProjectRootNotFound: '這部電腦上沒有這個資料夾，請檢查路徑後再試。',
  errProjectRootInvalid: '這個路徑不是可讀取的資料夾，請改選一個可讀取的資料夾。',
  errProjectNotFound: '這個專案已不存在。',
} as const;
