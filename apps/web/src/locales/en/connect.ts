export const enConnect = {
  pairTitle: 'Connect a phone',
  pairHint:
    "Scan this QR code with the phone's camera to sign in without typing the token. Each code works once and expires in 5 minutes; the phone must be on the same network as this computer.",
  pairOpen: 'Open on your phone',
  pairHttp:
    'This is plain HTTP: the token and the QR code are not encrypted on the local network, so use it only on a network you trust.',
  advancedTitle: 'Advanced features',
  advancedHint:
    'Show the pages for orchestrating several agents: tasks, review, team, knowledge, messages, schedules, execution hosts, integrations and workspaces. Not needed for Claude Code / Codex in a terminal; their addresses still open directly.',
  pairNoLan:
    'Only this computer can connect right now. Restart the control plane with AETHER_HOST=0.0.0.0 so a phone can reach it.',
  pairAddress: 'Address the phone uses',
  pairPaired: 'Phone connected',
  pairExpired: 'The QR code has expired. Generate a new one.',
  pairExpiresIn: 'Expires in',
  pairGenerate: 'Generate QR code',
  pairAgain: 'Generate again',
  pairing: 'Pairing…',
  pairFailed:
    'The code has expired or was already used. Generate a new one on the computer, or enter the token.',
  rememberDevice: 'Remember this device for 30 days',
} as const;
