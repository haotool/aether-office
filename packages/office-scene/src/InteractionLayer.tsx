import type { ReactNode } from 'react';
import type { Agent } from '@aether/contracts';
import { ROLE_LABELS, type RoleId } from '@aether/kernel';
import { contextLevel } from './context.js';
import type { Words } from './interaction-text.js';
import type {
  CharacterMenuContext,
  GroupBarContext,
  SceneInteraction,
} from './use-scene-interaction.js';

export type HoverFacts = {
  agent: Agent;
  /** The engineering role id the session was classified into. */
  role: string;
  context: number | null;
  doing: string | undefined;
};

type Registry = { set(id: string, node: HTMLElement): void; delete(id: string): void };
const refFor = (elements: Registry, id: string) => (node: HTMLElement | null) => {
  if (node) elements.set(id, node);
  else elements.delete(id);
};

/** The role's name in the page's language (the id itself when the classification is unknown). */
export const roleLabel = (role: string, zh: boolean) => {
  const label = ROLE_LABELS[role as RoleId];
  return label ? (zh ? label.zh : label.en) : role;
};

/** A small card after a moment of hover: who, in which role, what state, how full the context is, which tool. Never takes the pointer. */
function HoverCard({
  facts,
  words,
  zh,
  elements,
}: {
  facts: HoverFacts;
  words: Words;
  zh: boolean;
  elements: Registry;
}) {
  return (
    <div className="char-card" ref={refFor(elements, facts.agent.id)} role="tooltip">
      <strong>{facts.agent.name}</strong>
      <span>{roleLabel(facts.role, zh)}</span>
      <span data-state={facts.agent.activity}>{words.state[facts.agent.activity]}</span>
      {facts.context !== null && (
        <span className="label-ctx" data-level={contextLevel(facts.context)}>
          {words.context} {Math.round(facts.context)}%
        </span>
      )}
      {facts.doing && (
        <span>
          {words.doing} {facts.doing}
        </span>
      )}
    </div>
  );
}

type InteractionLayerProps = {
  ix: SceneInteraction;
  zh: boolean;
  compact: boolean;
  /** Reduced motion: icons fade instead of rising. */
  still: boolean;
  characterMenu: ((context: CharacterMenuContext) => ReactNode) | undefined;
  groupBar: ((context: GroupBarContext) => ReactNode) | undefined;
};

/** The emote icons rising over their characters, each in a box the scene places every frame. */
function EmoteIcons({ ix }: { ix: SceneInteraction }) {
  return ix.emotes.sprites.map((sprite) => (
    <div
      key={sprite.key}
      className="emote-anchor"
      ref={refFor(ix.spriteElements, `s${sprite.key}`)}
    >
      <span className="emote-sprite" aria-hidden="true">
        {sprite.icon}
      </span>
    </div>
  ));
}

/** The action menu of one character (supplied by the page): beside the character, or in the page's own sheet on a phone. */
function MenuSlot({
  ix,
  compact,
  characterMenu,
}: Pick<InteractionLayerProps, 'ix' | 'compact' | 'characterMenu'>) {
  const { marks, menuAgent } = ix;
  const menu =
    menuAgent && characterMenu
      ? characterMenu({
          id: menuAgent.id,
          agent: menuAgent,
          compact,
          close: () => marks.closeMenu(),
          scene: ix.actionsFor(menuAgent.id),
        })
      : null;
  if (!menuAgent || !menu) return null;
  return compact ? (
    menu
  ) : (
    <div className="char-menu-anchor" ref={refFor(ix.menuElements, menuAgent.id)}>
      {menu}
    </div>
  );
}

/** What the carried desk says: where it may land, or why it may not. */
function SeatHint({ ix }: { ix: SceneInteraction }) {
  const { words, seatDrag } = ix;
  if (!seatDrag.drag) return null;
  const { check } = seatDrag.drag;
  return (
    <p className={`seat-hint ${check.ok ? '' : 'blocked'}`} role="status">
      {check.ok ? words.dragStart : words.dragBlocked[check.reason]}
    </p>
  );
}

/**
 * Everything the scene draws over the canvas for interaction, none of it in the way of orbiting: the hover card, the
 * action menu of one character (supplied by the page; anchored beside the character, or in the page's own sheet on a
 * phone), the emote icons, the bar for a group, the marquee, the seat-drag hint and the live region screen readers hear.
 */
export function InteractionLayer({
  ix,
  zh,
  compact,
  still,
  characterMenu,
  groupBar,
}: InteractionLayerProps) {
  const { words, marks, hover, marquee } = ix;
  const group = [...marks.group];
  return (
    <div className={`char-layer ${still ? 'still' : ''}`}>
      {hover && <HoverCard facts={hover} words={words} zh={zh} elements={ix.cardElements} />}
      <MenuSlot ix={ix} compact={compact} characterMenu={characterMenu} />
      <EmoteIcons ix={ix} />
      {group.length > 0 &&
        groupBar?.({
          ids: group,
          clear: marks.clearGroup,
          pin: (on) => ix.pinIds(group, on),
          canPin: group.every(ix.pinnable),
        })}
      {marquee && (
        <div
          className="marquee"
          aria-hidden="true"
          style={{ left: marquee.x, top: marquee.y, width: marquee.width, height: marquee.height }}
        />
      )}
      <SeatHint ix={ix} />
      <p className="visually-hidden" role="status" aria-live="polite">
        {ix.line.text}
        {ix.line.n % 2 ? '' : '​'}
      </p>
    </div>
  );
}
