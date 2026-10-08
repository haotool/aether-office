import { useRef, type KeyboardEvent, type RefObject } from 'react';
import { nextKey, type KeyAction, type KeyState } from '../conversation/conv-keys.js';

const turnsOf = (root: HTMLElement) => [...root.querySelectorAll<HTMLElement>('[data-turn]')];

/** The turn the reader is at: the one holding focus, else the first whose end is still on screen. */
function currentTurn(root: HTMLElement, turns: HTMLElement[]): number {
  const focused = turns.findIndex((t) => t.contains(document.activeElement));
  if (focused >= 0) return focused;
  const top = root.getBoundingClientRect().top;
  const visible = turns.findIndex((t) => t.getBoundingClientRect().bottom > top + 1);
  return visible < 0 ? turns.length - 1 : visible;
}

/**
 * The conversation's keyboard, for a reader with focus in it: j and k move between turns, `g g` goes to the top and `G` to
 * the bottom. A field the person is typing in keeps its keys.
 */
export function useConvKeys(
  root: RefObject<HTMLElement | null>,
  toBottom: () => void,
  stopGliding: () => void,
  still: boolean,
) {
  const state = useRef<KeyState>({ pending: null, at: 0 });
  return (e: KeyboardEvent) => {
    const el = root.current;
    if (!el || e.metaKey || e.ctrlKey || e.altKey) return;
    if ((e.target as HTMLElement).closest('input, textarea, select, [contenteditable]')) return;
    const step = nextKey(state.current, e.key, e.timeStamp);
    state.current = step.state;
    if (!step.action) return;
    e.preventDefault();
    // A glide to the newest message that is still under way must not swallow the scroll the reader just asked for.
    if (step.action !== 'bottom') stopGliding();
    go(step.action, el, toBottom, still);
  };
}

function go(action: KeyAction, root: HTMLElement, toBottom: () => void, still: boolean) {
  const turns = turnsOf(root);
  if (!turns.length) return;
  const at = currentTurn(root, turns);
  const behavior = still ? 'auto' : 'smooth';
  if (action === 'bottom') {
    toBottom();
    turns.at(-1)!.focus({ preventScroll: true });
    return;
  }
  const to =
    action === 'top'
      ? 0
      : Math.max(0, Math.min(turns.length - 1, at + (action === 'next' ? 1 : -1)));
  turns[to]!.focus({ preventScroll: true });
  if (action === 'top') root.scrollTo({ top: 0, behavior });
  else turns[to]!.scrollIntoView({ block: 'start', behavior });
}
