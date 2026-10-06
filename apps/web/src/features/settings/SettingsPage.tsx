import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { Link, useLocation, useNavigate } from 'react-router-dom';
import { ChevronLeft } from 'lucide-react';
import type { Mode } from '@aether/contracts';
import { usePhoneAny } from '../../phone.js';
import { usePreferences } from '../../state.js';
import { Empty, PageHeading, useT } from '../../ui.js';
import { ADVANCED_ONLY } from './AdvancedSection.js';
import { SettingsContext, type Notice } from './context.js';
import { ENTRIES } from './entries.js';
import { searchSettings } from './search.js';
import { SECTIONS, sectionFromLocation, settingsPath, type SectionId } from './sections.js';
import { Section } from './SectionBody.js';
import { HomeList, SideNav } from './SettingsNav.js';
import { SettingsSearch } from './SettingsSearch.js';
import { useScrollSpy } from './useScrollSpy.js';

const NOTICE_MS = 6000;
const isTyping = (target: EventTarget | null) =>
  target instanceof HTMLElement && target.closest('input, textarea, select, [contenteditable]');

/**
 * Settings: the groups as a column of links beside the rows (scrolling the page moves the mark, a link scrolls to its
 * group and sets the address), or on a phone a list of groups that each open a page of their own. Search narrows both
 * to the rows that match. `/settings/<group>` and `#<group>` open a group directly.
 */
export function SettingsPage({
  projectId,
  mode,
  owner,
  canWrite,
}: {
  projectId: string;
  mode: Mode;
  owner: boolean;
  canWrite: boolean;
}) {
  const t = useT();
  const prefs = usePreferences();
  const phone = usePhoneAny();
  const location = useLocation();
  const navigate = useNavigate();
  const searchBox = useRef<HTMLInputElement>(null);
  const [query, setQuery] = useState('');
  const [notice, setNotice] = useState<Notice | null>(null);
  const requested = sectionFromLocation(location.pathname, location.hash);
  const matches = useMemo(() => {
    const found = searchSettings(query);
    return found && new Set([...found].filter((id) => prefs.advanced || !ADVANCED_ONLY.has(id)));
  }, [query, prefs.advanced]);
  const searching = matches !== null;
  const withMatches = SECTIONS.filter(
    (s) => !matches || ENTRIES.some((e) => e.section === s.id && matches.has(e.id)),
  );
  const drill = phone && !searching;
  const scope = { projectId, mode, owner, canWrite };
  const spied = useScrollSpy(
    withMatches.map((s) => s.id),
    !phone && !searching,
  );
  const active: SectionId | null = spied ?? requested ?? withMatches[0]?.id ?? null;

  const scrollTo = useCallback(
    (id: SectionId) =>
      document
        .getElementById(`s-${id}`)
        ?.scrollIntoView({ block: 'start', behavior: prefs.reducedMotion ? 'auto' : 'smooth' }),
    [prefs.reducedMotion],
  );
  const go = (id: SectionId) => {
    navigate(settingsPath(id, projectId));
    if (!phone) scrollTo(id);
  };
  // An address that names a group (a link, the back button) brings it into view; a phone's page starts at its top.
  useEffect(() => {
    if (phone) document.querySelector('.main-content')?.scrollTo(0, 0);
    else if (requested && !searching) scrollTo(requested);
    // eslint-disable-next-line react-hooks/exhaustive-deps -- only a change of address moves the page
  }, [requested, phone]);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key !== '/' || e.metaKey || e.ctrlKey || e.altKey || isTyping(e.target)) return;
      e.preventDefault();
      searchBox.current?.focus();
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, []);

  useEffect(() => {
    if (!notice) return;
    const timer = setTimeout(() => setNotice(null), NOTICE_MS);
    return () => clearTimeout(timer);
  }, [notice]);

  const search = (
    <SettingsSearch
      ref={searchBox}
      query={query}
      count={matches ? matches.size : null}
      onChange={setQuery}
    />
  );
  const detail = drill && requested ? requested : null;
  const detailMeta = SECTIONS.find((s) => s.id === detail);
  return (
    <SettingsContext.Provider value={{ query, matches, notify: setNotice }}>
      <div className="settings">
        {detailMeta ? (
          <header className="settings-bar">
            <Link className="back-link" to={settingsPath(null, projectId)}>
              <ChevronLeft size={20} aria-hidden="true" />
              {t('settings')}
            </Link>
            <h1>{t(detailMeta.label)}</h1>
          </header>
        ) : (
          <>
            <PageHeading title={t('settings')} />
            {search}
          </>
        )}
        {drill && !requested ? (
          <HomeList sections={SECTIONS} projectId={projectId} onGo={go} />
        ) : searching && !withMatches.length ? (
          <Empty title={`${t('stNoResults')} “${query.trim()}”`} />
        ) : (
          <div className={`settings-layout ${drill || searching ? 'single' : ''}`}>
            {!drill && !searching && (
              <SideNav sections={SECTIONS} active={active} projectId={projectId} onGo={go} />
            )}
            <div className="settings-main">
              {(drill ? SECTIONS.filter((s) => s.id === detail) : withMatches).map((s) => (
                <Section key={s.id} id={s.id} scope={scope} heading={!drill} />
              ))}
            </div>
          </div>
        )}
        {notice && (
          <div className="stoast" role="status">
            <span>{notice.text}</span>
            {notice.undo && (
              <button
                type="button"
                className="text-button"
                onClick={() => {
                  notice.undo?.();
                  setNotice(null);
                }}
              >
                {t('undo')}
              </button>
            )}
          </div>
        )}
      </div>
    </SettingsContext.Provider>
  );
}
