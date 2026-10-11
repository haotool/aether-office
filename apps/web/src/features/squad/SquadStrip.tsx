import { CornerDownRight } from 'lucide-react';
import { useT } from '../../ui/useT.js';
import type { SquadView } from '../feed/feed-squads.js';
import { SubDot } from './SquadParts.js';
import { rowName, squadSummary } from './squad-text.js';

const MAX_CHIPS = 8;

export function SquadStrip({
  view,
  picked,
  onPick,
}: {
  view: SquadView;
  picked: string | null;
  onPick: (memberId: string | null) => void;
}) {
  const t = useT();
  const shown = view.rows.slice(0, MAX_CHIPS);
  const more = view.rows.length - shown.length;
  return (
    <div className="squad-strip" data-squad={view.hue} role="group" aria-label={t('squadStrip')}>
      <span className="squad-strip-head">
        <CornerDownRight size={12} aria-hidden="true" />
        {squadSummary(t, view)}
      </span>
      <span className="squad-strip-chips">
        {shown.map((row) => (
          <button
            key={row.id}
            type="button"
            className="squad-chip-button u-chip"
            data-status={row.status}
            data-fading={row.fading || undefined}
            aria-pressed={picked === row.id}
            onClick={() => onPick(picked === row.id ? null : row.id)}
          >
            <SubDot status={row.status} />
            <span>{rowName(row)}</span>
          </button>
        ))}
        {more > 0 && <span className="squad-more">{`+${more}`}</span>}
      </span>
    </div>
  );
}
