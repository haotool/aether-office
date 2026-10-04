import { Server } from 'lucide-react';
import type { Snapshot } from '@aether/contracts';
import { useT, PageHeading, Badge, Empty } from '../ui.js';
import { MachineInvite } from './MachineInvite.js';

/** The runners that have enrolled, and how to enrol one more. */
export function MachinesPage({
  data,
  projectId,
  canInvite,
}: {
  data: Snapshot;
  projectId: string;
  canInvite: boolean;
}) {
  const t = useT();
  return (
    <>
      <PageHeading title={t('machines')} subtitle={t('machineHint')} />
      {data.runner.length ? (
        <div className="machine-grid">
          {data.runner.map((machine) => (
            <article className="panel machine-card" key={machine.id}>
              <Server size={26} />
              <h2>{machine.name}</h2>
              <Badge state={machine.state === 'online' ? 'online' : 'machineOffline'} />
              <p>
                {t('lastSeen')}: {new Date(machine.lastSeen).toLocaleTimeString()}
              </p>
            </article>
          ))}
        </div>
      ) : (
        <Empty title={t('noMachines')} hint={t('machineHint')} />
      )}
      <MachineInvite projectId={projectId} canInvite={canInvite} />
    </>
  );
}
