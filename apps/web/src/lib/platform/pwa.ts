import { useSyncExternalStore } from 'react';
import { CACHE_PREFIX, SKIP_WAITING } from '../../sw/cache-rules.js';

// Service workers need a secure context (https, localhost or 127.0.0.1): a phone that opens the office at
// http://192.168.x.x gets the plain page, and nothing here runs.

const FLAG = 'aether-sw';
const INSTALL_DELAY_MS = 3000;

type Environment = {
  secure: boolean;
  supported: boolean;
  production: boolean;
  disabled: boolean;
};

export const canRegister = (env: Environment): boolean =>
  env.secure && env.supported && env.production && !env.disabled;

export function switchedOff(
  search: string,
  store: Pick<Storage, 'getItem' | 'setItem' | 'removeItem'>,
): boolean {
  try {
    const asked = new URLSearchParams(search).get('sw');
    if (asked === 'off') store.setItem(FLAG, 'off');
    else if (asked === 'on') store.removeItem(FLAG);
    return store.getItem(FLAG) === 'off';
  } catch {
    return false;
  }
}

let waiting: ServiceWorker | null = null;
let updating = false;
const listeners = new Set<() => void>();
const hold = (worker: ServiceWorker | null) => {
  waiting = worker;
  listeners.forEach((notify) => notify());
};

export const useUpdateReady = () =>
  useSyncExternalStore(
    (notify) => {
      listeners.add(notify);
      return () => listeners.delete(notify);
    },
    () => waiting !== null,
  );

export function applyUpdate() {
  updating = true;
  waiting?.postMessage(SKIP_WAITING);
}

async function remove() {
  for (const registration of await navigator.serviceWorker.getRegistrations())
    await registration.unregister();
  for (const name of await caches.keys())
    if (name.startsWith(CACHE_PREFIX)) await caches.delete(name);
}

async function register() {
  const registration = await navigator.serviceWorker.register('/sw.js');
  const track = () => {
    if (registration.waiting && navigator.serviceWorker.controller) hold(registration.waiting);
  };
  track();
  registration.addEventListener('updatefound', () =>
    registration.installing?.addEventListener('statechange', track),
  );
  navigator.serviceWorker.addEventListener('controllerchange', () => {
    if (updating) window.location.reload();
  });
  // A tab left open for days would never look: ask whenever it is brought back.
  document.addEventListener('visibilitychange', () => {
    if (!document.hidden) void registration.update().catch(() => undefined);
  });
}

export function startServiceWorker() {
  const supported = 'serviceWorker' in navigator;
  let disabled = false;
  try {
    disabled = switchedOff(window.location.search, window.localStorage);
  } catch {
    // storage blocked: the worker stays on, there is nowhere to keep the switch
  }
  const env = {
    secure: window.isSecureContext,
    supported,
    production: import.meta.env.PROD,
    disabled,
  };
  if (supported && disabled) void remove();
  if (!canRegister(env)) return;
  // After the page has settled, so that keeping the files never competes with showing them. The page works without it.
  const start = () =>
    window.setTimeout(() => void register().catch(() => undefined), INSTALL_DELAY_MS);
  if (document.readyState === 'complete') start();
  else window.addEventListener('load', start, { once: true });
}
