/** The approvals words, in English. */
export const enApprovals = {
  reqTitle: 'Permission request',
  reqCountdown: 'Terminal asks in',
  reqTerminal: 'Asking in the terminal',
  reqAllowOnce: 'Allow once',
  reqAllowSession: 'Allow for this session',
  reqDeny: 'Deny',
  reqReview: 'Review',
  reqLanBlocked:
    'This connection is plain HTTP over the network, so answers are refused here. Answer on the computer itself, or over HTTPS (see Settings → Remote approvals).',
  reqReason: 'Reason for Claude (optional)',
  reqSessionRules: 'Adds for this session:',
  reqTooLate: 'Too late: the terminal is asking now. Answer it there.',
  reqFailed: 'Could not send the answer. Try again.',
  remoteApprovalsTitle: 'Remote approvals',
  remoteApprovalsToggle: 'Answer Claude Code permission prompts here',
  remoteApprovalsHint:
    'Off by default. When on, a permission prompt of a Claude Code session whose hooks include the remote approval hook shows here with Allow and Deny. If nobody answers within the wait (45 s by default), Claude asks in its terminal as usual, so the terminal prompt appears after that delay. AETHER never allows anything by itself: only a button press does.',
  remoteApprovalsInstall: 'Install the hook in a project (or add --scope user for every session):',
  remoteApprovalsOwner: 'Only the owner can change this.',
  remoteApprovalsBlocked:
    'This page is open over plain HTTP on the network, so answering from it is refused: the answer would travel with your session cookie unencrypted. Open AETHER on this computer (localhost) or over HTTPS (for example a Tailscale tunnel). A phone on the same Wi-Fi cannot approve until you do one of these, or start the control plane with AETHER_REMOTE_APPROVALS_LAN=1 and accept that risk on a network you trust.',
  remoteApprovalsLanOn:
    'Answers over plain HTTP on the network are allowed (AETHER_REMOTE_APPROVALS_LAN=1). Anyone on this network who can see the traffic could read your session cookie and answer for you. Use only on a network you trust.',
} as const;
