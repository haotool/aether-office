import { CornerDownRight } from 'lucide-react';
import { useT } from '../ui.js';
import type { SquadView } from './feed-squads.js';
import { SubDot } from './SquadParts.js';
import { rowName, squadSummary } from './squad-text.js';

/** More chips than this and the rest are counted (the cards below list every subagent). */
const MAX_CHIPS = 8;

/**
 * The supervisor's conversation header, one line under it: its live subagents as chips with their status. A chip scrolls
 * to that subagent's card below the transcript and opens it; pressing it again lets go.
 */
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
            className="squad-chip-button"
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
