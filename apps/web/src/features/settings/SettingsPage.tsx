import { Link } from 'react-router-dom';
import { ChevronLeft } from 'lucide-react';
import type { Mode } from '@aether/contracts';
import { Empty } from '../../ui/Empty.js';
import { PageHeading } from '../../ui/PageHeading.js';
import { useT } from '../../ui/useT.js';
import { SettingsContext, type Notice } from './context.js';
import { SECTIONS, settingsPath } from './sections.js';
import { Section, type SettingsScope } from './SectionBody.js';
import { HomeList, SideNav } from './SettingsNav.js';
import { SettingsSearch } from './SettingsSearch.js';
import { useSettingsPage, type SettingsPageState } from './useSettingsPage.js';

/** The brief message at the foot of the page, with an undo when the change can be taken back. */
function SettingsToast({ notice, onDismiss }: { notice: Notice; onDismiss: () => void }) {
  const t = useT();
  return (
    <div className="stoast" role="status">
      <span>{notice.text}</span>
      {notice.undo && (
        <button
          type="button"
          className="text-button"
          onClick={() => {
            notice.undo?.();
            onDismiss();
          }}
        >
          {t('undo')}
        </button>
      )}
    </div>
  );
}

/** The title row: a back link and the group's name on a phone's group page, otherwise the heading and the search. */
function SettingsHeader({ page, projectId }: { page: SettingsPageState; projectId: string }) {
  const t = useT();
  const detailMeta = SECTIONS.find((s) => s.id === page.detail);
  if (detailMeta)
    return (
      <header className="settings-bar">
        <Link className="back-link" to={settingsPath(null, projectId)}>
          <ChevronLeft size={20} aria-hidden="true" />
          {t('settings')}
        </Link>
        <h1>{t(detailMeta.label)}</h1>
      </header>
    );
  return (
    <>
      <PageHeading title={t('settings')} />
      <SettingsSearch
        ref={page.searchBox}
        query={page.query}
        count={page.matches ? page.matches.size : null}
        onChange={page.setQuery}
      />
    </>
  );
}

/** The groups: the phone's list, the empty search result, or the navigation column beside the rows. */
function SettingsGroups({
  page,
  projectId,
  scope,
}: {
  page: SettingsPageState;
  projectId: string;
  scope: SettingsScope;
}) {
  const t = useT();
  const { drill, searching, requested, withMatches, query } = page;
  if (drill && !requested)
    return <HomeList sections={SECTIONS} projectId={projectId} onGo={page.go} />;
  if (searching && !withMatches.length)
    return <Empty title={`${t('stNoResults')} “${query.trim()}”`} />;
  return (
    <div className={`settings-layout ${drill || searching ? 'single' : ''}`}>
      {!drill && !searching && (
        <SideNav sections={SECTIONS} active={page.active} projectId={projectId} onGo={page.go} />
      )}
      <div className="settings-main">
        {(drill ? SECTIONS.filter((s) => s.id === page.detail) : withMatches).map((s) => (
          <Section key={s.id} id={s.id} scope={scope} heading={!drill} />
        ))}
      </div>
    </div>
  );
}

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
  const page = useSettingsPage(projectId);
  const scope = { projectId, mode, owner, canWrite };
  return (
    <SettingsContext.Provider
      value={{ query: page.query, matches: page.matches, notify: page.setNotice }}
    >
      <div className="settings">
        <SettingsHeader page={page} projectId={projectId} />
        <SettingsGroups page={page} projectId={projectId} scope={scope} />
        {page.notice && (
          <SettingsToast notice={page.notice} onDismiss={() => page.setNotice(null)} />
        )}
      </div>
    </SettingsContext.Provider>
  );
}
