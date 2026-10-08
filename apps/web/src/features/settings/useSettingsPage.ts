import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { useLocation, useNavigate } from 'react-router-dom';
import { usePhoneAny } from '../../phone.js';
import { usePreferences } from '../../state.js';
import { useLatest } from '../../use-latest.js';
import { ADVANCED_ONLY } from './AdvancedSection.js';
import type { Notice } from './context.js';
import { ENTRIES } from './entries.js';
import { searchSettings } from './search.js';
import { SECTIONS, sectionFromLocation, settingsPath, type SectionId } from './sections.js';
import { useScrollSpy } from './useScrollSpy.js';

const NOTICE_MS = 6000;
const isTyping = (target: EventTarget | null) =>
  target instanceof HTMLElement && target.closest('input, textarea, select, [contenteditable]');

/** The ids of the rows that match the query among those the person may see; null when not searching. */
function useMatches(query: string) {
  const advanced = usePreferences((s) => s.advanced);
  return useMemo(() => {
    const found = searchSettings(query);
    return found && new Set([...found].filter((id) => advanced || !ADVANCED_ONLY.has(id)));
  }, [query, advanced]);
}

/** Pressing "/" outside a field focuses the search box. */
function useSearchShortcut() {
  const searchBox = useRef<HTMLInputElement>(null);
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key !== '/' || e.metaKey || e.ctrlKey || e.altKey || isTyping(e.target)) return;
      e.preventDefault();
      searchBox.current?.focus();
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, []);
  return searchBox;
}

/** The notice shown for a few seconds, then cleared. */
function useNotice() {
  const [notice, setNotice] = useState<Notice | null>(null);
  useEffect(() => {
    if (!notice) return;
    const timer = setTimeout(() => setNotice(null), NOTICE_MS);
    return () => clearTimeout(timer);
  }, [notice]);
  return [notice, setNotice] as const;
}

/** Brings the group the address names into view (a link, the back button); a phone's page starts at its top. */
function useScrollToSection(requested: SectionId | null, phone: boolean, searching: boolean) {
  const reducedMotion = usePreferences((s) => s.reducedMotion);
  const scrollTo = useCallback(
    (id: SectionId) =>
      document
        .getElementById(`s-${id}`)
        ?.scrollIntoView({ block: 'start', behavior: reducedMotion ? 'auto' : 'smooth' }),
    [reducedMotion],
  );
  // An address that names a group (a link, the back button) brings it into view; a phone's page starts at its top.
  const bring = useLatest({ scrollTo, searching });
  useEffect(() => {
    if (phone) document.querySelector('.main-content')?.scrollTo(0, 0);
    else if (requested && !bring.current.searching) bring.current.scrollTo(requested); // only a change of address moves the page
  }, [requested, phone, bring]);
  return scrollTo;
}

/** The Settings page's state: the search, which groups show, the marked one, and navigation between them. */
export function useSettingsPage(projectId: string) {
  const phone = usePhoneAny();
  const location = useLocation();
  const navigate = useNavigate();
  const searchBox = useSearchShortcut();
  const [query, setQuery] = useState('');
  const [notice, setNotice] = useNotice();
  const requested = sectionFromLocation(location.pathname, location.hash);
  const matches = useMatches(query);
  const searching = matches !== null;
  const withMatches = SECTIONS.filter(
    (s) => !matches || ENTRIES.some((e) => e.section === s.id && matches.has(e.id)),
  );
  const drill = phone && !searching;
  const spied = useScrollSpy(
    withMatches.map((s) => s.id),
    !phone && !searching,
  );
  const scrollTo = useScrollToSection(requested, phone, searching);
  return {
    query,
    setQuery,
    notice,
    setNotice,
    matches,
    searching,
    withMatches,
    drill,
    requested,
    detail: drill && requested ? requested : null,
    searchBox,
    active: (spied ?? requested ?? withMatches[0]?.id ?? null) as SectionId | null,
    go: (id: SectionId) => {
      navigate(settingsPath(id, projectId));
      if (!phone) scrollTo(id);
    },
  };
}

export type SettingsPageState = ReturnType<typeof useSettingsPage>;
