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
  if (drill && !requested) return <HomeList projectId={projectId} onGo={page.go} />;
  if (searching && !withMatches.length)
    return <Empty title={`${t('stNoResults')} “${query.trim()}”`} />;
  return (
    <div className={`settings-layout ${drill || searching ? 'single' : ''}`}>
      {!drill && !searching && (
        <SideNav active={page.active} projectId={projectId} onGo={page.go} />
      )}
      <div className="settings-main">
        {(drill ? SECTIONS.filter((s) => s.id === page.detail) : withMatches).map((s) => (
          <Section key={s.id} id={s.id} scope={scope} heading={!drill} />
        ))}
      </div>
    </div>
  );
}

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
