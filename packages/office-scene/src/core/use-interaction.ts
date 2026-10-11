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

export function useAnnouncer() {
  const [line, setLine] = useState({ text: '', n: 0 });
  const announce = useCallback((text: string) => setLine((l) => ({ text, n: l.n + 1 })), []);
  return { line, announce };
}

type MarksOptions = {
  words: Words;
  selectedId: string | null;
  onSelect: (id: string) => void;
  focusTag: (id: string) => void;
  announce: (text: string) => void;
};
type Ids = ReadonlySet<string>;
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
      if (say) announce(words.menuClosed);
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

function useEscape(open: boolean, close: () => void) {
  useEffect(() => {
    if (!open) return;
    const key = (e: KeyboardEvent) => {
      if (e.key !== 'Escape' || e.defaultPrevented || document.querySelector('dialog[open]'))
        return;
      close();
    };
    window.addEventListener('keydown', key);
    return () => window.removeEventListener('keydown', key);
  }, [open, close]);
}

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
