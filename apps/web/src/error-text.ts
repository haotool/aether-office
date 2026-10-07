import { translate, type Key, type Locale } from './i18n.js';

// What a person can run into without the orchestration pages, in words. Any other code is shown as it is: a code is
// better than a guess about what went wrong.
const WORDS: Record<string, Key> = {
  AUTH_REQUIRED: 'errAuthRequired',
  LOGIN_RATE_LIMIT: 'errLoginRateLimit',
  FORBIDDEN: 'errForbidden',
  LIVE_EXECUTION_NOT_ENABLED: 'errLiveExecutionOff',
  TERMINAL_PROFILE_NOT_GRANTED: 'errTerminalProfile',
  TERMINAL_MACHINE_UNAVAILABLE: 'errNoRunner',
  SESSION_NOT_FOUND: 'errSessionNotFound',
  SESSION_NOT_RUNNING: 'errSessionNotRunning',
  PROCESS_CHANGED: 'errProcessChanged',
  SESSION_NOT_STALE: 'errSessionNotStale',
  LOCAL_SESSIONS_OFF: 'errLocalSessionsOff',
  PAIRING_INVALID: 'errPairingInvalid',
  VERSION_CONFLICT: 'errVersionConflict',
  PROJECT_ROOT_NOT_FOUND: 'errProjectRootNotFound',
  PROJECT_ROOT_INVALID: 'errProjectRootInvalid',
};

export const errorText = (code: string, locale: Locale): string => {
  const key = WORDS[code];
  return key ? translate(locale, key) : code;
};

/** The language the person chose (kept by the preferences store); read here so this file needs no browser at import. */
export const savedLocale = (): Locale => {
  try {
    const saved = JSON.parse(localStorage.getItem('aether-ui-preferences') ?? '{}') as {
      state?: { locale?: Locale };
    };
    return saved.state?.locale === 'en' ? 'en' : 'zh-TW';
  } catch {
    return 'zh-TW'; // no storage (a test, a private window): the product's default language
  }
};
