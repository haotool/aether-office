import { useSyncExternalStore } from 'react';

// Chromium offers its own install prompt (`beforeinstallprompt`) that the page may hold back and show from a button.
// iOS has no such event: Safari only installs from its Share sheet, so the page can only say how.

const DISMISSED = 'aether-install-dismissed';

type InstallEvent = Event & { prompt(): Promise<void> };
type InstallHint = 'prompt' | 'ios' | null;

export function isIos(userAgent: string, touchPoints: number): boolean {
  // iPadOS reports itself as a Mac, with a touch screen.
  return /iPhone|iPad|iPod/.test(userAgent) || (/Macintosh/.test(userAgent) && touchPoints > 1);
}

export function installHint(state: {
  canPrompt: boolean;
  ios: boolean;
  standalone: boolean;
  dismissed: boolean;
}): InstallHint {
  if (state.standalone || state.dismissed) return null;
  if (state.canPrompt) return 'prompt';
  return state.ios ? 'ios' : null;
}

let event: InstallEvent | null = null;
let dismissed = false;
const listeners = new Set<() => void>();
const changed = () => listeners.forEach((notify) => notify());

/** Starts listening; called once, before the app renders, because the browser fires its event early. */
export function watchInstall() {
  try {
    dismissed = window.localStorage.getItem(DISMISSED) === '1';
  } catch {
    // storage blocked: the hint comes back next time
  }
  window.addEventListener('beforeinstallprompt', (e) => {
    e.preventDefault();
    event = e as InstallEvent;
    changed();
  });
  window.addEventListener('appinstalled', () => {
    event = null;
    changed();
  });
}

const standalone = () =>
  window.matchMedia('(display-mode: standalone)').matches ||
  (navigator as Navigator & { standalone?: boolean }).standalone === true;

export function useInstallHint() {
  const hint = useSyncExternalStore(
    (notify) => {
      listeners.add(notify);
      return () => listeners.delete(notify);
    },
    () =>
      installHint({
        canPrompt: event !== null,
        ios: isIos(navigator.userAgent, navigator.maxTouchPoints),
        standalone: standalone(),
        dismissed,
      }),
  );
  return {
    hint,
    install: () => {
      void event?.prompt();
      event = null;
      changed();
    },
    dismiss: () => {
      dismissed = true;
      try {
        window.localStorage.setItem(DISMISSED, '1');
      } catch {
        // see above
      }
      changed();
    },
  };
}
