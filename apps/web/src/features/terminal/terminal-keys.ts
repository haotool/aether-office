/** The keys a phone's keyboard does not have, and what a terminal expects for each. */
export const TERMINAL_KEYS = [
  { label: 'Esc', label_zh: 'Esc', send: '\x1b' },
  { label: 'Tab', label_zh: 'Tab', send: '\t' },
  { label: '^C', label_zh: '中斷 ^C', send: '\x03' },
  { label: '^D', label_zh: '結束 ^D', send: '\x04' },
  { label: '↑', label_zh: '上', send: '\x1b[A' },
  { label: '↓', label_zh: '下', send: '\x1b[B' },
  { label: '←', label_zh: '左', send: '\x1b[D' },
  { label: '→', label_zh: '右', send: '\x1b[C' },
  { label: '⏎', label_zh: 'Enter', send: '\r' },
] as const;
