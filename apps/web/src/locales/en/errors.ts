export const enErrors = {
  errRequestFailed: 'The request did not go through. Check the connection and try again.',
  errAuthRequired: 'Sign-in failed or has expired. Check the owner token and try again.',
  errLoginRateLimit: 'Too many sign-in attempts. Wait a minute and try again.',
  errForbidden: 'You do not have permission to do this.',
  errLiveExecutionOff:
    'Live agents are off. Turn on "Allow live agents" in Settings, connect a runner and enable it in its native file (docs/native-execution.md).',
  errTerminalProfile:
    'This folder has no terminal profile. Connect a runner and turn on cliTerminals (docs/native-execution.md).',
  errNoRunner: 'No runner is connected, so the terminal cannot start.',
  errTerminalCapacity:
    'This machine is running as many terminals as it allows. Close one to open another.',
  errSessionNotFound: 'That session is gone. The list will refresh.',
  errSessionNotRunning: 'That session is no longer running.',
  errProcessChanged: 'The process changed since you looked. Refresh and try again.',
  errSessionNotStale: 'It was used again, so it was left alone.',
  errLocalSessionsOff: 'Local session discovery is off (AETHER_LOCAL_SESSIONS=off).',
  errPairingInvalid: 'This pairing code is wrong, used or expired. Create a new one.',
  errVersionConflict: 'Someone changed this first. Reload and try again.',
  errProjectRootNotFound:
    'That folder does not exist on this machine. Check the path and try again.',
  errProjectRootInvalid: 'That path is not a folder this app can read. Choose a readable folder.',
  errProjectNotFound: 'That project no longer exists.',
} as const;
