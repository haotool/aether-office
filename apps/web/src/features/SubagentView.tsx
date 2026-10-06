import type { AttributedSession } from '@aether/contracts';
import { useT } from '../ui.js';
import { callsOf, type SquadRow } from './feed-squads.js';
import { RelationChip } from './SquadParts.js';
import { fmt } from './squad-text.js';
import { SubagentFacts } from './SubagentCards.js';

/**
 * A subagent's own view (it was selected as a member): who spawned it, what it is doing, its recent calls. It has no
 * transcript of its own to read, so this replaces the conversation, and the supervisor is one press away.
 */
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

/** The foot of a subagent's view: it cannot be written to, so the way on is its supervisor. */
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
