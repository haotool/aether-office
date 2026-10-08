import { useMemo, useRef, type CSSProperties } from 'react';
import type { Agent } from '@aether/contracts';
import { contextLevel } from './context.js';
import { createLongPress } from './long-press.js';
import { ProviderMark, type MarkProvider } from './provider-marks.js';

/** The tooltip of a tag: the full title with the technical id for a session's member, else just the name. */
export const tipOf = (agent: Agent, names?: { title: string; tag: string }) =>
  names ? `${names.title} · ${names.tag}` : agent.name;

type NameTagProps = {
  agent: Agent;
  provider: MarkProvider | undefined;
  /** Share of the context window in use, 0 to 100; null when unknown. */
  context: number | null;
  selected: boolean;
  hovered: boolean;
  /** In the group picked with Shift or a rectangle. */
  grouped: boolean;
  menuOpen: boolean;
  unread: boolean;
  /** The member's department color: the tag's neon edge. */
  accent: string;
  /** The second line of the open card (repository, role, what it is doing); null while the tag is closed. */
  meta: string[] | null;
  /** The tooltip: the full title and the technical id. */
  tip: string;
  /** Motion is off (the page's setting or the system's): no pulse, no shimmer. */
  still: boolean;
  /** What a screen reader says: the full title, role, state. */
  label: string;
  setElement: (node: HTMLButtonElement | null) => void;
  onPointerDown: () => void;
  onActivate: (how: { shift: boolean; keyboard: boolean }) => void;
  onMenu: () => void;
  /** An Alt press: the start of carrying the desk; true when it began. */
  onGrab: (event: PointerEvent) => boolean;
  onHover: (on: boolean) => void;
};

/** What a tag shows: the provider's mark, the status dot, the name, an unread mark and, open, the context share and the card line. */
function TagFace({
  agent,
  provider,
  context,
  open,
  unread,
  meta,
}: Pick<NameTagProps, 'agent' | 'provider' | 'context' | 'unread' | 'meta'> & { open: boolean }) {
  return (
    <>
      {provider && <ProviderMark provider={provider} />}
      <i className="tag-dot" aria-hidden="true" />
      <span className="tag-name">{agent.name}</span>
      {unread && <i className="tag-unread" aria-hidden="true" />}
      {open && context !== null && (
        <b className="label-ctx" data-level={contextLevel(context)}>
          {Math.round(context)}%
        </b>
      )}
      {meta && meta.length > 0 && <small className="tag-meta">{meta.join(' · ')}</small>}
    </>
  );
}

/**
 * A member's name tag over the scene, a small glass chip: the provider's mark, a status dot that glows in the state's
 * colour, and the short label (`agent.name`, already cut on a meaning boundary by the kernel's `shortLabel`). Hovered or
 * selected it opens into a card with a second line (repository, role, what it is doing) and the share of the context
 * window in use. How much of it shows by distance (far: mark and dot; near: the label) is CSS on `data-density`, which
 * the projection sets each frame. The technical id (`cx·01a1`) is only in the tooltip, with the full title.
 *
 * The tag is also the keyboard's way to the character: Enter or Space on it opens the action menu, a right click or a
 * held finger does too, Shift adds it to a group, and Alt-dragging it carries the desk.
 */
export function NameTag(props: NameTagProps) {
  const { selected, hovered, grouped, accent, onMenu, onGrab, onHover } = props;
  const menu = useRef(onMenu);
  menu.current = onMenu;
  const press = useMemo(() => createLongPress(() => menu.current()), []);
  return (
    <button
      ref={props.setElement}
      className={`scene-label ${selected ? 'selected' : ''} ${hovered ? 'hovered' : ''} ${grouped ? 'grouped' : ''}`}
      data-state={props.agent.activity}
      data-still={props.still ? '1' : undefined}
      style={{ ['--accent' as string]: accent } as CSSProperties}
      title={props.tip}
      aria-label={props.label}
      aria-haspopup="menu"
      aria-expanded={props.menuOpen}
      onPointerDown={(e) => {
        props.onPointerDown(); // a moving camera would slide the tag out from under the finger
        if (e.pointerType === 'touch') press.start(e.clientX, e.clientY);
        else if (e.altKey && e.button === 0 && onGrab(e.nativeEvent)) e.preventDefault();
      }}
      onPointerMove={(e) => press.move(e.clientX, e.clientY)}
      onPointerUp={press.end}
      onPointerCancel={press.end}
      onContextMenu={(e) => {
        e.preventDefault();
        onMenu();
      }}
      onClick={(e) => {
        if (press.consumeClick()) return;
        props.onActivate({ shift: e.shiftKey, keyboard: e.detail === 0 }); // detail is 0 for Enter and Space
      }}
      onPointerEnter={() => onHover(true)}
      onPointerLeave={() => onHover(false)}
    >
      <TagFace {...props} open={hovered || selected} />
    </button>
  );
}
