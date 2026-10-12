export const zhApprovals = {
  reqTitle: '權限請求',
  reqCountdown: '終端機將詢問，剩',
  reqTerminal: '正在終端機詢問',
  reqAllowOnce: '允許一次',
  reqAllowSession: '本次工作階段都允許',
  reqDeny: '拒絕',
  reqReview: '檢視',
  reqLanBlocked:
    '這個連線是區域網路上的明文 HTTP，因此在這裡回答會被拒絕。請在這台電腦上回答，或改用 HTTPS（見「設定 → 遠端核准」）。',
  reqReason: '給 Claude 的理由（選填）',
  reqSessionRules: '本次工作階段將加入：',
  reqTooLate: '來不及了：終端機正在詢問，請在那裡回答。',
  reqFailed: '無法送出回答，請再試一次。',
  remoteApprovalsToggle: '在這裡回答 Claude Code 的權限提示',
  remoteApprovalsHint:
    '預設關閉。開啟後，已安裝遠端核准 hook 的 Claude Code session 發出權限提示時，這裡會出現允許與拒絕。若在等待時間內（預設 45 秒）沒人回答，Claude 會照常在終端機詢問，所以終端機提示會延後這麼久才出現。AETHER 不會自行允許任何事：只有你按下按鈕才算數。',
  remoteApprovalsInstall: '在專案安裝 hook（加上 --scope user 則套用到所有 session）：',
  remoteApprovalsBlocked:
    '這個頁面是透過區域網路上的明文 HTTP 開啟的，因此無法從這裡回答：答案會連同你的登入 cookie 以未加密方式傳送。請在這台電腦上開啟 AETHER（localhost），或改用 HTTPS（例如 Tailscale 通道）。在你做到其中一項之前，同一個 Wi-Fi 上的手機無法核准；或者以 AETHER_REMOTE_APPROVALS_LAN=1 啟動控制平面，並在你信任的網路上自行承擔風險。',
  remoteApprovalsLanOn:
    '已允許在區域網路上以明文 HTTP 回答（AETHER_REMOTE_APPROVALS_LAN=1）。同一網路上能看到流量的人可以讀取你的登入 cookie 並代你回答。請只在你信任的網路上使用。',
} as const;
