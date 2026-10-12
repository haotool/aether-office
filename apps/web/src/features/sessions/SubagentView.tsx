import type { AttributedSession } from '@aether/contracts';
import { useT } from '../../ui/useT.js';
import { callsOf, type SquadRow } from '../feed/feed-squads.js';
import { RelationChip } from '../squad/SquadParts.js';
import { fmt } from '../squad/squad-text.js';
import { SubagentFacts } from './SubagentCards.js';

export function SubagentView({
  row,
  session,
  supervisorLabel,
  hue,
  onOpenSupervisor,
}: {
  row: SquadRow | null;
  session: AttributedSession;
  supervisorLabel: string;
  hue: number;
  onOpenSupervisor: () => void;
}) {
  const t = useT();
  return (
    <div className="conv-body">
      <div className="conv-scroll sub-view" data-squad={hue}>
        <RelationChip
          text={fmt(t('subSpawnedBy'), { name: supervisorLabel })}
          hue={hue}
          onOpen={onOpenSupervisor}
        />
        {row ? (
          <SubagentFacts row={row} calls={callsOf(session, row.id)} />
        ) : (
          <p className="sub-none">{t('subGone')}</p>
        )}
      </div>
    </div>
  );
}

export function SubagentFoot({ onOpenSupervisor }: { onOpenSupervisor: () => void }) {
  const t = useT();
  return (
    <>
      <p>{t('subNoInput')}</p>
      <button type="button" className="secondary" onClick={onOpenSupervisor}>
        {t('subOpenSupervisor')}
      </button>
    </>
  );
}
