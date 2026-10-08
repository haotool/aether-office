import type { Layout, Snapshot } from '@aether/contracts';
import type { Session } from '../api-session.js';
import type { TourAction, TourState } from '../tour.js';
import type { OfficeModel } from './office-model.js';
import {
  FirstSessionHint,
  OfficeHeading,
  OfficeStats,
  SceneFooter,
  SceneToolbar,
  TeamStrip,
} from './OfficeParts.js';
import { SceneView } from './SceneView.js';
import { KpiDashboardLazy } from './KpiDashboardLazy.js';
import { KpiStrip } from './KpiStrip.js';
import { useKpiPanel } from './use-kpi-panel.js';

type OfficePageProps = {
  data: Snapshot;
  session: Session;
  model: OfficeModel;
  projectId: string;
  selectedId: string | null;
  focus: string;
  tour: TourState;
  /** A layout being edited, shown live in the scene before it is saved. */
  preview: Layout | null;
  /** Keys of local sessions with something new for the user. */
  unread: ReadonlySet<string>;
  canWrite: boolean;
  onSelect: (id: string) => void;
  onOpen: (id: string) => void;
  onFeed: (id: string) => void;
  onFocus: (focus: string) => void;
  onTour: (action: TourAction) => void;
  onTogglePanel: () => void;
  onNewTask: () => void;
  onEditLayout: () => void;
  onNotice: (message: string) => void;
  onRefresh: () => void;
};

/** The office page: heading and counts, the 3D scene (or the 2D list) with its toolbar, and the team strip. */
export function OfficePage(props: OfficePageProps) {
  const { session, model, data, projectId, selectedId, canWrite, onSelect } = props;
  const kpi = useKpiPanel();
  return (
    <>
      <OfficeHeading
        canWrite={canWrite}
        onTogglePanel={props.onTogglePanel}
        onNewTask={props.onNewTask}
      />
      <OfficeStats data={data} model={model} mode={session.mode} />
      {session.mode === 'live' && model.agents.length === 1 && <FirstSessionHint />}
      <KpiStrip usage={kpi.usage} git={kpi.git} running={kpi.running} onOpen={() => kpi.open()} />
      <div className="scene-shell">
        <SceneToolbar {...props} />
        <SceneView {...props} floorKpi={kpi.badges} onOpenFloorKpi={kpi.open} />
        {kpi.isOpen && <KpiDashboardLazy kpi={kpi} />}
        <SceneFooter mode={session.mode} />
      </div>
      <TeamStrip model={model} projectId={projectId} selectedId={selectedId} onSelect={onSelect} />
    </>
  );
}
