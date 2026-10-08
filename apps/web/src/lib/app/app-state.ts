import { useState } from 'react';
import { useQueryClient } from '@tanstack/react-query';
import type { Layout } from '@aether/contracts';
import type { Session } from '../api/api-session.js';
import { useT, useLocale } from '../../ui/useT.js';
import { usePreferences } from '../preferences/state.js';
import { usePhoneAny } from '../preferences/phone.js';
import { useLocalSessions } from './app-data.js';
import { isOperator } from '../navigation/roles.js';
import { sessionIdOf } from '../sessions/session-names.js';
import { useDocumentTitle, useFocusRequest, useProjectStream, useTour } from './app-hooks.js';
import { useAttention, useOfficeSelection, useProjectSelection } from './app-selection.js';
import type { SheetHeight } from '../../features/sessions/SessionSheet.js';
import { attentionKeys } from '../../features/feed/feed-model.js';
import { useSessionFeed } from '../../features/sessions/use-session-feed.js';
import { useBeats } from '../../features/sessions/activity-rate.js';
import { useLeaving } from '../../features/operations/clock-out.js';
import { officeModel } from '../../features/office/office-model.js';

/** What the frame itself remembers: the camera, the panel and the sheet, the menu, the banners and the open dialog. */
function useShellState() {
  const [newProject, setNewProject] = useState(false);
  const [preview, setPreview] = useState<Layout | null>(null);
  const [focus, setFocus] = useState('overview');
  // A narrow desktop window shows the panel as an overlay on the office: closed until asked for.
  const [panelOpen, setPanelOpen] = useState(() => window.innerWidth > 1000);
  const [sheet, setSheet] = useState<SheetHeight>('peek');
  const [menu, setMenu] = useState(false);
  const [offline, setOffline] = useState(false);
  const [notice, setNotice] = useState('');
  return {
    ...{ newProject, setNewProject, preview, setPreview, focus, setFocus },
    ...{ panelOpen, setPanelOpen, sheet, setSheet, menu, setMenu },
    ...{ offline, setOffline, notice, setNotice },
  };
}

/** The office as drawn: the members, who is selected, the feed and what counts as unread. */
function useOfficeView(
  sel: ReturnType<typeof useProjectSelection>,
  local: ReturnType<typeof useLocalSessions>['data'],
) {
  const locale = useLocale();
  const beats = useBeats(local?.sessions);
  const leaving = useLeaving((s) => s.leaving);
  const model = officeModel(
    sel.snapshot.data,
    local?.sessions,
    sel.projectId,
    locale,
    beats,
    leaving,
  );
  const selected = model.agents.find((a) => a.id === sel.selectedId) ?? null;
  const selectedKey = sel.selectedId ? sessionIdOf(sel.selectedId) : null;
  const selectedSession = local?.sessions.find((x) => x.key === selectedKey) ?? null;
  // Nothing is running anywhere yet: the office is empty, so it says how to start instead of showing an empty building.
  const quiet =
    sel.page === 'office' &&
    !sel.unknownPage &&
    !!local?.enabled &&
    local.sessions.length === 0 &&
    model.agents.length === 0;
  const feed = useSessionFeed(local?.sessions, selectedKey);
  const unread = attentionKeys(feed); // the same sessions every badge counts
  return { model, selected, selectedSession, quiet, feed, unread };
}

/** Everything the signed-in frame shows and does: its state, the address, the data, and what waits for the person. */
export function useApplication(session: Session) {
  const t = useT();
  const prefs = usePreferences();
  const client = useQueryClient();
  const shell = useShellState();
  const { setFocus, setNotice } = shell;
  const { tour, act } = useTour(setFocus);
  const compact = usePhoneAny(); // portrait or on its side: immersive office, sheets
  const sel = useProjectSelection(session, shell.offline, setNotice);
  const local = useLocalSessions(session);
  const { needs } = useAttention(
    session,
    sel.projectId,
    sel.projects.data,
    local.data?.sessions,
    sel.snapshot.data,
    setNotice,
  );
  const view = useOfficeView(sel, local.data);
  const pick = useOfficeSelection({
    ...{ projectId: sel.projectId, sessions: local.data?.sessions, compact },
    ...{ setParams: sel.setParams, setFocus },
    ...{ setPanelOpen: shell.setPanelOpen, setSheet: shell.setSheet },
  });
  // The tab's title carries what needs the person, so it shows in a background tab.
  const waitingOnYou =
    needs.approvals + needs.sessions + (prefs.advanced ? needs.tasks + needs.messages : 0);
  useDocumentTitle(sel.unknownPage ? t('notFoundTitle') : t(sel.page), waitingOnYou);
  useProjectStream(sel.projectId, true, sel.snapshot.data?.seq, shell.setOffline);
  useFocusRequest(sel.params, sel.setParams, view.selected?.id, setFocus);
  const refresh = () => {
    void client.invalidateQueries({ queryKey: ['snapshot', sel.projectId] });
  };
  const canWrite = isOperator(session.actor.role);
  return {
    session,
    prefs,
    shell,
    tour,
    act,
    compact,
    sel,
    local,
    needs,
    canWrite,
    view,
    pick,
    refresh,
  };
}

export type Application = ReturnType<typeof useApplication>;
