import { useCallback, useEffect, useRef, useState } from 'react';
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

/**
 * What the person has open or marked in the scene: the action menu of one character, the group of characters picked
 * with Shift or a rectangle, and the members pinned to the wall of small views. Each change is announced.
 */
export function useCharacterMarks({
  words,
  selectedId,
  onSelect,
  focusTag,
  announce,
}: {
  words: Words;
  selectedId: string | null;
  onSelect: (id: string) => void;
  /** Moves keyboard focus to a character's name tag (the menu gives it back there when it closes). */
  focusTag: (id: string) => void;
  announce: (text: string) => void;
}) {
  const [menuId, setMenuId] = useState<string | null>(null);
  const [group, setGroup] = useState<ReadonlySet<string>>(new Set());
  const [pinned, setPinned] = useState<ReadonlySet<string>>(new Set());
  const latest = useRef({ menuId, selectedId, group, pinned });
  latest.current = { menuId, selectedId, group, pinned };

  const closeMenu = useCallback(
    (returnFocus = true, say = false) => {
      const id = latest.current.menuId;
      if (!id) return;
      setMenuId(null);
      if (say) announce(words.menuClosed); // an action that closes the menu has its own words to say
      if (returnFocus) setTimeout(() => focusTag(id), 0);
    },
    [announce, words.menuClosed, focusTag],
  );
  const openMenu = useCallback(
    (id: string) => {
      if (latest.current.selectedId !== id) onSelect(id);
      setGroup(new Set());
      setMenuId(id);
      announce(words.menuOpened);
    },
    [onSelect, announce, words.menuOpened],
  );
  /** A click or tap: the first chooses, the second (on the chosen one) opens the menu, Shift adds to the group. */
  const activate = useCallback(
    (id: string, how: { shift: boolean; keyboard: boolean }) => {
      const { menuId: open, selectedId: chosen } = latest.current;
      if (how.shift) {
        const g = latest.current.group;
        const next = new Set(g.size === 0 && chosen && chosen !== id ? [chosen] : g);
        if (next.has(id)) next.delete(id);
        else next.add(id);
        setMenuId(null);
        setGroup(next);
        announce(`${words.grouped} ${next.size}`);
        return;
      }
      setGroup(new Set());
      if (open === id) return closeMenu(true, true);
      if (how.keyboard || chosen === id) return openMenu(id);
      onSelect(id);
    },
    [announce, closeMenu, onSelect, openMenu, words.grouped],
  );
  const clearGroup = useCallback(() => {
    if (latest.current.group.size) announce(words.groupCleared);
    setGroup(new Set());
  }, [announce, words.groupCleared]);
  const pick = useCallback(
    (ids: readonly string[]) => {
      const next = new Set([...latest.current.group, ...ids]);
      setMenuId(null);
      setGroup(next);
      announce(`${words.grouped} ${next.size}`);
    },
    [announce, words.grouped],
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
    [announce, words.pinned, words.unpinned],
  );

  // Esc closes the menu, or else the group; a press on the empty scene closes the menu.
  useEffect(() => {
    if (!menuId && group.size === 0) return;
    const key = (e: KeyboardEvent) => {
      if (e.key !== 'Escape' || e.defaultPrevented || document.querySelector('dialog[open]'))
        return; // a dialog's own Esc
      if (menuId) closeMenu(true, true);
      else clearGroup();
    };
    window.addEventListener('keydown', key);
    return () => window.removeEventListener('keydown', key);
  }, [menuId, group.size, closeMenu, clearGroup]);

  return { menuId, group, pinned, openMenu, closeMenu, activate, clearGroup, pick, pin };
}
