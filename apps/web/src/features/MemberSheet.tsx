import { useState } from 'react';
import { ChevronUp, Focus, X } from 'lucide-react';
import type { Agent, LocalSession, Snapshot } from '@aether/contracts';
import { AvatarIcon, Badge, useT } from '../ui.js';
import { Inspector } from './Inspector.js';

/**
 * The member in hand on a phone: a slim bar over the tab bar (who, what they are doing, focus, details) so the scene
 * stays visible; "details" opens the full inspector.
 */
export function MemberSheet({
  agent,
  session,
  snapshot,
  onClose,
  onFocus,
}: {
  agent: Agent;
  session: LocalSession | null;
  snapshot: Snapshot;
  onClose: () => void;
  onFocus: () => void;
}) {
  const t = useT();
  const [expanded, setExpanded] = useState(false);
  const [tall, setTall] = useState(false);
  if (expanded)
    return (
      <>
        <button
          className="sheet-backdrop"
          aria-label={t('close')}
          onClick={() => setExpanded(false)}
        />
        <Inspector
          agent={agent}
          session={session}
          snapshot={snapshot}
          onClose={() => setExpanded(false)}
          onFocus={onFocus}
          tall={tall}
          onToggleTall={() => setTall(!tall)}
        />
      </>
    );
  return (
    <div className="member-bar" role="region" aria-label={agent.name}>
      <AvatarIcon species={agent.species} color={agent.color} name={agent.name} size={40} />
      <div className="member-bar-text">
        <strong>{agent.name}</strong>
        <small>{agent.role}</small>
      </div>
      <Badge state={agent.activity} />
      <button className="icon-button" aria-label={t('focus')} onClick={onFocus}>
        <Focus size={20} />
      </button>
      <button className="icon-button" aria-label={t('details')} onClick={() => setExpanded(true)}>
        <ChevronUp size={22} />
      </button>
      <button className="icon-button" aria-label={t('close')} onClick={onClose}>
        <X size={20} />
      </button>
    </div>
  );
}
