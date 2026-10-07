/** The terminals words, in English. */
export const enTerminals = {
  terminalCommandState: 'Latest command status',
  terminals: 'Terminals',
  terminalNote: 'Interactive PTY sessions; structured logs are not interactive terminals.',
  terminalReadOnly: 'Read only',
  terminalAgentWorking: 'working',
  terminalAgentWaiting: 'waiting for you',
  terminalAgentIdle: 'idle',
  terminalControlled: 'You control input',
  terminalTakeover: 'Take control',
  terminalRelease: 'Release control',
  terminalStop: 'Stop terminal',
  terminalStart: 'Start terminal',
  terminalProfile: 'Locally approved launch profile',
  terminalNoProfile:
    'No terminal profiles yet. A runner has to be connected (pnpm runner:enroll) and its native file needs "cliTerminals": true or a "terminals" entry; see docs/native-execution.md.',
  terminalCols: 'Columns',
  terminalRows: 'Rows',
  terminalResize: 'Resize',
  terminalGap: 'Earlier output was truncated; prior ANSI state may be missing.',
  terminalInputNote:
    'Input enters a durable queue. Writing to a PTY does not prove agent understanding. Closing this page does not stop the process.',
} as const;
