// A page left open across a rebuild asks for chunks (hashed file names) that no longer exist, and a React render error
// with no boundary unmounts the whole app: a blank page. A chunk that cannot load is cured by loading the page again.

const CHUNK_ERROR =
  /dynamically imported module|importing a module script failed|error loading dynamically imported module|loading chunk|loading css chunk/i;
const RELOAD_KEY = 'aether-chunk-reload';
const RELOAD_WINDOW_MS = 10_000;

export const isChunkLoadError = (error: unknown): boolean =>
  CHUNK_ERROR.test(error instanceof Error ? `${error.name} ${error.message}` : String(error));

/** True once per window: a reload that does not help (the server really lacks the file) must not loop. */
export function mayReloadForChunk(
  store: Pick<Storage, 'getItem' | 'setItem'>,
  now: number,
): boolean {
  try {
    const last = Number(store.getItem(RELOAD_KEY) ?? 0);
    if (now - last < RELOAD_WINDOW_MS) return false;
    store.setItem(RELOAD_KEY, String(now));
    return true;
  } catch {
    return false; // storage blocked (private mode): never reload blindly
  }
}
