import { lazy, Suspense } from 'react';
import type { KpiPanel } from './use-kpi-panel.js';

// The dashboard's charts and tiles load when it is first opened, not with the office: the strip is all a phone needs at start.
const Dashboard = lazy(() =>
  import('./KpiDashboard.js').then((m) => ({ default: m.KpiDashboardHost })),
);

export function KpiDashboardLazy({ kpi }: { kpi: KpiPanel }) {
  return (
    <Suspense fallback={null}>
      <Dashboard kpi={kpi} />
    </Suspense>
  );
}
