export class MemoryStorage {
  private readonly map = new Map<string, string>();
  getItem(key: string) {
    return this.map.get(key) ?? null;
  }
  setItem(key: string, value: string) {
    this.map.set(key, String(value));
  }
  removeItem(key: string) {
    this.map.delete(key);
  }
  clear() {
    this.map.clear();
  }
}

export class FakeMedia extends EventTarget {
  constructor(public matches: boolean) {
    super();
  }
  set(matches: boolean) {
    this.matches = matches;
    this.dispatchEvent(new Event('change'));
  }
}

export class FakeEventSource {
  static all: FakeEventSource[] = [];
  closed = false;
  onerror: (() => void) | null = null;
  private readonly listeners = new Map<string, ((event: { data: string }) => void)[]>();
  constructor(readonly url: string) {
    FakeEventSource.all.push(this);
  }
  addEventListener(type: string, listener: (event: { data: string }) => void) {
    this.listeners.set(type, [...(this.listeners.get(type) ?? []), listener]);
  }
  close() {
    this.closed = true;
  }
  emit(type: string, data: unknown) {
    for (const listener of this.listeners.get(type) ?? []) listener({ data: JSON.stringify(data) });
  }
  fail() {
    this.onerror?.();
  }
}

const installed = new Map<string, PropertyDescriptor | undefined>();
function define(name: string, value: unknown) {
  if (!installed.has(name)) installed.set(name, Object.getOwnPropertyDescriptor(globalThis, name));
  Object.defineProperty(globalThis, name, { value, configurable: true, writable: true });
}

export type BrowserEnv = {
  window: EventTarget & Record<string, unknown>;
  document: EventTarget & { visibilityState: 'visible' | 'hidden' };
  storage: MemoryStorage;
  media: Map<string, FakeMedia>;
};

export function installBrowserEnv(matching: readonly string[] = []): BrowserEnv {
  const storage = new MemoryStorage();
  const media = new Map<string, FakeMedia>();
  const win = Object.assign(new EventTarget(), {
    localStorage: storage,
    innerWidth: 1280,
    location: { search: '' },
    matchMedia: (query: string) => {
      if (!media.has(query)) media.set(query, new FakeMedia(matching.includes(query)));
      return media.get(query)!;
    },
  }) as unknown as BrowserEnv['window'];
  const doc = Object.assign(new EventTarget(), { visibilityState: 'visible' as const });
  define('window', win);
  define('document', doc);
  define('localStorage', storage);
  define('sessionStorage', new MemoryStorage());
  return { window: win, document: doc, storage, media };
}

export function removeBrowserEnv() {
  for (const [name, original] of installed) {
    if (original) Object.defineProperty(globalThis, name, original);
    else delete (globalThis as Record<string, unknown>)[name];
  }
  installed.clear();
}

export { define as installGlobal };

/** A DOM-like event carrying extra fields (key, target, persisted...), which a plain `Event` would not let us set. */
export function domEvent(type: string, fields: Record<string, unknown> = {}): Event {
  const event = new Event(type, { cancelable: true });
  for (const [name, value] of Object.entries(fields))
    Object.defineProperty(event, name, { value, configurable: true });
  return event;
}
