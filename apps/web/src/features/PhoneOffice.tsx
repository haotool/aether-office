import { useNavigate } from 'react-router-dom';
import { Plus, RotateCcw } from 'lucide-react';
import type { AttributedSession, Layout, Snapshot } from '@aether/contracts';
import { sessionLink } from '../session-names.js';
import { usePreferences } from '../state.js';
import type { TourAction } from '../tour.js';
import { useT } from '../ui/useT.js';
import { ActiveSessions } from './ActiveSessions.js';
import { AttentionSessions } from './AttentionSessions.js';
import type { OfficeModel } from './office-model.js';
import { SceneView } from './SceneView.js';
import { KpiDashboardLazy } from './KpiDashboardLazy.js';
import { KpiStrip } from './KpiStrip.js';
import { useKpiPanel } from './use-kpi-panel.js';

type PhoneOfficeProps = {
  data: Snapshot;
  model: OfficeModel;
  selectedId: string | null;
  focus: string;
  preview: Layout | null;
  unread: ReadonlySet<string>;
  canWrite: boolean;
  sessions: readonly AttributedSession[];
  owner: boolean;
  /** The full-height sheet hides the scene. */
  covered: boolean;
  onSelect: (id: string) => void;
  onOpen: (id: string) => void;
  onFeed: (id: string) => void;
  onFocus: (focus: string) => void;
  onTour: (action: TourAction) => void;
  onNewTask: () => void;
  onNotice: (message: string) => void;
  onRefresh: () => void;
};

/**
 * The office on a portrait phone: the scene fills the screen and everything else is a small control floating over it
 * (view switch and active sessions on top, a new-task button at the thumb). No heading, no stats, no team strip.
 */
export function PhoneOffice({ sessions, owner, onFocus, onNewTask, ...scene }: PhoneOfficeProps) {
  const t = useT();
  const advanced = usePreferences((s) => s.advanced);
  const kpi = useKpiPanel();
  return (
    <div className="phone-office">
      <SceneView compact floorKpi={kpi.badges} onOpenFloorKpi={kpi.open} {...scene} />
      <PhoneTop sessions={sessions} owner={owner} focus={scene.focus} onFocus={onFocus} />
      <div className="phone-kpi">
        <KpiStrip usage={kpi.usage} git={kpi.git} running={kpi.running} onOpen={() => kpi.open()} />
      </div>
      {kpi.isOpen && <KpiDashboardLazy kpi={kpi} />}
      {scene.canWrite && advanced && (
        <button className="fab" aria-label={t('newWork')} onClick={onNewTask}>
          <Plus size={24} />
        </button>
      )}
    </div>
  );
}

/** The controls floating over the top of the phone's scene: the view switch, the session lists and the camera reset. */
function PhoneTop({
  sessions,
  owner,
  focus,
  onFocus,
}: {
  sessions: readonly AttributedSession[];
  owner: boolean;
  focus: string;
  onFocus: (focus: string) => void;
}) {
  const t = useT();
  const prefs = usePreferences();
  const navigate = useNavigate();
  return (
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
  );
}
