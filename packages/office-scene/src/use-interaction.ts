import {
  useCallback,
  useEffect,
  useRef,
  useState,
  type Dispatch,
  type RefObject,
  type SetStateAction,
} from 'react';
import type { Words } from './interaction-text.js';

const HOVER_CARD_MS = 300;

/** The hovered id once it has stayed hovered for a moment, and never on a screen with no hover (a finger). */
export function useHoverCard(hovered: string | null): string | null {
  const [shown, setShown] = useState<string | null>(null);
  useEffect(() => {
    if (!hovered || !window.matchMedia('(hover: hover)').matches) {
      setShown(null);
      return;
    }
    const timer = setTimeout(() => setShown(hovered), HOVER_CARD_MS);
    return () => {
      clearTimeout(timer);
      setShown(null);
    };
  }, [hovered]);
  return shown;
}

/** A line for assistive technology: each call replaces the last, and the same words twice are heard twice. */
export function useAnnouncer() {
  const [line, setLine] = useState({ text: '', n: 0 });
  const announce = useCallback((text: string) => setLine((l) => ({ text, n: l.n + 1 })), []);
  return { line, announce };
}

type MarksOptions = {
  words: Words;
  selectedId: string | null;
  onSelect: (id: string) => void;
  /** Moves keyboard focus to a character's name tag (the menu gives it back there when it closes). */
  focusTag: (id: string) => void;
  announce: (text: string) => void;
};
type Ids = ReadonlySet<string>;
/** What the callbacks read when they run, so they need not change with every render. */
type Latest = RefObject<{
  menuId: string | null;
  selectedId: string | null;
  group: Ids;
  pinned: Ids;
}>;
type Setters = {
  setMenuId: Dispatch<SetStateAction<string | null>>;
  setGroup: Dispatch<SetStateAction<Ids>>;
};

/** The action menu of one character: opening it chooses the character and drops the group; closing hands focus back to its tag. */
function useMenu(
  { words, onSelect, focusTag, announce }: MarksOptions,
  latest: Latest,
  { setMenuId, setGroup }: Setters,
) {
  const closeMenu = useCallback(
    (returnFocus = true, say = false) => {
      const id = latest.current.menuId;
      if (!id) return;
      setMenuId(null);
      if (say) announce(words.menuClosed); // an action that closes the menu has its own words to say
      if (returnFocus) setTimeout(() => focusTag(id), 0);
    },
    [latest, setMenuId, announce, words.menuClosed, focusTag],
  );
  const openMenu = useCallback(
    (id: string) => {
      if (latest.current.selectedId !== id) onSelect(id);
      setGroup(new Set());
      setMenuId(id);
      announce(words.menuOpened);
    },
    [latest, setGroup, setMenuId, onSelect, announce, words.menuOpened],
  );
  return { closeMenu, openMenu };
}

/** The group picked with Shift or a rectangle, and the members pinned to the wall. */
function useGroup(
  { words, announce }: MarksOptions,
  latest: Latest,
  { setMenuId, setGroup }: Setters,
  setPinned: Dispatch<SetStateAction<Ids>>,
) {
  const toggle = useCallback(
    (id: string) => {
      const { selectedId: chosen, group } = latest.current;
      const next = new Set(group.size === 0 && chosen && chosen !== id ? [chosen] : group);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      setMenuId(null);
      setGroup(next);
      announce(`${words.grouped} ${next.size}`);
    },
    [latest, setMenuId, setGroup, announce, words.grouped],
  );
  const clearGroup = useCallback(() => {
    if (latest.current.group.size) announce(words.groupCleared);
    setGroup(new Set());
  }, [latest, setGroup, announce, words.groupCleared]);
  const pick = useCallback(
    (ids: readonly string[]) => {
      const next = new Set([...latest.current.group, ...ids]);
      setMenuId(null);
      setGroup(next);
      announce(`${words.grouped} ${next.size}`);
    },
    [latest, setMenuId, setGroup, announce, words.grouped],
  );
  const pin = useCallback(
    (ids: readonly string[], on: boolean) => {
      const next = new Set(latest.current.pinned);
      for (const id of ids) {
        if (on) next.add(id);
        else next.delete(id);
      }
      setPinned(next);
      announce(on ? words.pinned : words.unpinned);
    },
    [latest, setPinned, announce, words.pinned, words.unpinned],
  );
  return { toggle, clearGroup, pick, pin };
}

/** Esc closes the menu, or else the group; a press on the empty scene closes the menu. */
function useEscape(open: boolean, close: () => void) {
  useEffect(() => {
    if (!open) return;
    const key = (e: KeyboardEvent) => {
      if (e.key !== 'Escape' || e.defaultPrevented || document.querySelector('dialog[open]'))
        return; // a dialog's own Esc
      close();
    };
    window.addEventListener('keydown', key);
    return () => window.removeEventListener('keydown', key);
  }, [open, close]);
}

/**
 * What the person has open or marked in the scene: the action menu of one character, the group of characters picked
 * with Shift or a rectangle, and the members pinned to the wall of small views. Each change is announced.
 */
export function useCharacterMarks(o: MarksOptions) {
  const { selectedId, onSelect } = o;
  const [menuId, setMenuId] = useState<string | null>(null);
  const [group, setGroup] = useState<Ids>(new Set());
  const [pinned, setPinned] = useState<Ids>(new Set());
  const latest = useRef({ menuId, selectedId, group, pinned });
  latest.current = { menuId, selectedId, group, pinned };
  const setters = { setMenuId, setGroup };
  const { closeMenu, openMenu } = useMenu(o, latest, setters);
  const { toggle, clearGroup, pick, pin } = useGroup(o, latest, setters, setPinned);
  /** A click or tap: the first chooses, the second (on the chosen one) opens the menu, Shift adds to the group. */
  const activate = useCallback(
    (id: string, how: { shift: boolean; keyboard: boolean }) => {
      const { menuId: open, selectedId: chosen } = latest.current;
      if (how.shift) return toggle(id);
      setGroup(new Set());
      if (open === id) return closeMenu(true, true);
      if (how.keyboard || chosen === id) return openMenu(id);
      onSelect(id);
    },
    [toggle, closeMenu, openMenu, onSelect],
  );
  const dismiss = useCallback(() => {
    if (menuId) closeMenu(true, true);
    else clearGroup();
  }, [menuId, closeMenu, clearGroup]);
  useEscape(menuId !== null || group.size > 0, dismiss);
  return { menuId, group, pinned, openMenu, closeMenu, activate, clearGroup, pick, pin };
}
