import { useEffect, useMemo } from 'react';
import { useQuery } from '@tanstack/react-query';
import {
  useLocation,
  useNavigate,
  useSearchParams,
  type SetURLSearchParams,
} from 'react-router-dom';
import type { AttributedSession, Project, Snapshot } from '@aether/contracts';
import { api } from '../api/api.js';
import { type Session } from '../api/api-session.js';
import { fill, type Key } from '../i18n/i18n.js';
import { isPage } from '../navigation/nav.js';
import { isOperator } from '../navigation/roles.js';
import { useT } from '../../ui/useT.js';
import { sessionIdOf } from '../sessions/session-names.js';
import { focusFeedRow, useSessionNotices } from './app-hooks.js';
import { useApprovals } from './app-data.js';
import {
  askingKeys,
  usePermissionRequests,
} from '../../features/operations/permission-requests.js';
import {
  needsYou,
  sessionsNeedingYou,
  sessionsWaiting,
} from '../../features/sessions/needs-you.js';
import {
  useApprovalNotifications,
  useNotificationPermission,
  type AlertSink,
} from '../notifications/notifications.js';
import { usePreferences } from '../preferences/state.js';
import { POLL, poll } from './polling.js';

function useProjectFallback(
  requestedGone: boolean,
  fallbackName: string | undefined,
  setParams: ReturnType<typeof useSearchParams>[1],
  setNotice: (message: string) => void,
) {
  const t = useT();
  useEffect(() => {
    if (!requestedGone) return;
    if (fallbackName) setNotice(fill(t('projectFallback'), fallbackName));
    setParams(
      (p) => {
        p.delete('project');
        return p;
      },
      { replace: true },
    );
  }, [requestedGone, fallbackName, setParams, setNotice, t]);
}

export function useProjectSelection(
  session: Session | null,
  offline: boolean,
  setNotice: (message: string) => void,
) {
  const [params, setParams] = useSearchParams();
  const location = useLocation();
  const page = (location.pathname.split('/')[1] || 'office') as Key;
  const unknownPage = !isPage(page);
  const projects = useQuery({
    queryKey: ['projects'],
    queryFn: () => api<Project[]>('/api/projects'),
    enabled: !!session,
  });
  const requested = params.get('project');
  const requestedGone =
    !!requested && !!projects.data && !projects.data.some((p) => p.id === requested);
  const projectId = requestedGone ? projects.data?.[0]?.id : (requested ?? projects.data?.[0]?.id);
  const snapshot = useQuery({
    queryKey: ['snapshot', projectId],
    queryFn: () => api<Snapshot>(`/api/projects/${projectId}/snapshot`),
    enabled: !!session && !!projectId && !!projects.data,
    ...poll(offline ? POLL.list : POLL.slow),
    retry: 1,
  });
  useProjectFallback(requestedGone, projects.data?.[0]?.name, setParams, setNotice);
  return {
    page,
    unknownPage,
    params,
    setParams,
    projects,
    snapshot,
    projectId,
    selectedId: params.get('agent'),
  };
}

export function useAttention(
  session: Session | null,
  projectId: string | undefined,
  projects: readonly Project[] | undefined,
  sessions: AttributedSession[] | undefined,
  snapshot: Snapshot | undefined,
  setNotice: (message: string) => void,
  offline: boolean,
) {
  const t = useT();
  const notify = usePreferences((s) => s.notify);
  const navigate = useNavigate();
  const { approvals, pending } = useApprovals(session, projectId, offline);
  const sink: AlertSink = useMemo(
    () => ({ toast: setNotice, open: (to: string) => navigate(to) }),
    [navigate, setNotice],
  );
  const requests = usePermissionRequests(isOperator(session?.actor.role));
  const asking = useMemo(() => askingKeys(requests), [requests]);
  useNotificationPermission(!!session && notify);
  useApprovalNotifications(
    projectId,
    approvals,
    !!session && notify,
    {
      title: t('approvalNeeded'),
      project: projects?.find((p) => p.id === projectId)?.name ?? '',
    },
    sink,
  );
  useSessionNotices(
    sessions,
    notify,
    { needsYou: t('sessionNeedsYou'), finished: t('sessionFinished') },
    sink,
    asking,
  );
  const needs = needsYou(
    snapshot,
    pending,
    sessionsNeedingYou(sessionsWaiting(sessions, Date.now()), asking),
  );
  return { needs, asking };
}

type PanelState = {
  projectId: string | undefined;
  sessions: AttributedSession[] | undefined;
  compact: boolean;
  setParams: SetURLSearchParams;
  setFocus: (focus: string) => void;
  setPanelOpen: (open: boolean) => void;
  setSheet: (height: 'half' | 'full') => void;
};

export function useOfficeSelection(state: PanelState) {
  const { projectId, sessions, compact, setParams, setFocus, setPanelOpen, setSheet } = state;
  const select = (id: string) => {
    setParams((p) => {
      p.set('agent', id);
      if (projectId) p.set('project', projectId);
      return p;
    });
    setPanelOpen(true);
  };
  const deselect = () =>
    setParams((p) => {
      p.delete('agent');
      return p;
    });
  const openConversation = (id: string) => {
    select(id);
    if (compact) setSheet('full');
  };
  const showInFeed = (id: string) => {
    deselect();
    setPanelOpen(true);
    if (compact) setSheet('half');
    focusFeedRow(id);
  };
  const open = (id: string) => {
    const own = sessions?.find((x) => x.key === sessionIdOf(id))?.projectId;
    if (own && own !== projectId) setParams({ project: own, agent: id, focus: '1' });
    else {
      select(id);
      setFocus(id);
    }
  };
  return { select, deselect, openConversation, showInFeed, open };
}
