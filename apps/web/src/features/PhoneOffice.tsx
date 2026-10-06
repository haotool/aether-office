import { useNavigate } from 'react-router-dom';
import { Plus, RotateCcw } from 'lucide-react';
import type { AttributedSession, Layout, Snapshot } from '@aether/contracts';
import { sessionLink } from '../localSessions.js';
import { usePreferences } from '../state.js';
import type { TourAction } from '../tour.js';
import { useT } from '../ui.js';
import { ActiveSessions } from './ActiveSessions.js';
import { AttentionSessions } from './AttentionSessions.js';
import type { OfficeModel } from './office-model.js';
import { SceneView } from './SceneView.js';

/**
 * The office on a portrait phone: the scene fills the screen and everything else is a small control floating over it
 * (view switch and active sessions on top, a new-task button at the thumb). No heading, no stats, no team strip.
 */
export function PhoneOffice({
  data,
  model,
  selectedId,
  focus,
  preview,
  unread,
  canWrite,
  sessions,
  owner,
  onSelect,
  onFocus,
  onTour,
  onNewTask,
  onNotice,
  onRefresh,
}: {
  data: Snapshot;
  model: OfficeModel;
  selectedId: string | null;
  focus: string;
  preview: Layout | null;
  unread: ReadonlySet<string>;
  canWrite: boolean;
  sessions: readonly AttributedSession[];
  owner: boolean;
  onSelect: (id: string) => void;
  onFocus: (focus: string) => void;
  onTour: (action: TourAction) => void;
  onNewTask: () => void;
  onNotice: (message: string) => void;
  onRefresh: () => void;
}) {
  const t = useT();
  const prefs = usePreferences();
  const advanced = prefs.advanced;
  const navigate = useNavigate();
  return (
    <div className="phone-office">
      <SceneView
        compact
        data={data}
        model={model}
        selectedId={selectedId}
        focus={focus}
        preview={preview}
        unread={unread}
        canWrite={canWrite}
        onSelect={onSelect}
        onTour={onTour}
        onNotice={onNotice}
        onRefresh={onRefresh}
      />
      <div className="phone-top">
        <div className="segmented" role="group" aria-label={t('office')}>
          {(['3d', '2d'] as const).map((view) => (
            <button
              key={view}
              className={prefs.view === view ? 'selected' : ''}
              aria-pressed={prefs.view === view}
              onClick={() => prefs.set({ view })}
            >
              {view === '3d' ? '3D' : '2D'}
            </button>
          ))}
        </div>
        <div className="phone-top-right">
          <ActiveSessions sessions={sessions} onOpen={(s) => navigate(sessionLink(s))} />
          <AttentionSessions
            sessions={sessions}
            owner={owner}
            onOpen={(s) => navigate(sessionLink(s))}
          />
          {prefs.view === '3d' && (
            <button
              className="round"
              aria-label={t('reset')}
              onClick={() => onFocus(focus === 'overview' ? 'atrium' : 'overview')}
            >
              <RotateCcw size={18} />
            </button>
          )}
        </div>
      </div>
      {canWrite && advanced && (
        <button className="fab" aria-label={t('newWork')} onClick={onNewTask}>
          <Plus size={24} />
        </button>
      )}
    </div>
  );
}
