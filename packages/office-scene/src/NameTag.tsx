import { useMemo, useRef, type CSSProperties } from 'react';
import type { Agent } from '@aether/contracts';
import { contextLevel } from './context.js';
import { createLongPress } from './long-press.js';
import { ProviderMark, type MarkProvider } from './provider-marks.js';

/** The tooltip of a tag: the full title with the technical id for a session's member, else just the name. */
export const tipOf = (agent: Agent, names?: { title: string; tag: string }) =>
  names ? `${names.title} · ${names.tag}` : agent.name;

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
export function NameTag({
  agent,
  provider,
  context,
  selected,
  hovered,
  grouped,
  menuOpen,
  unread,
  accent,
  meta,
  tip,
  still,
  label,
  setElement,
  onPointerDown,
  onActivate,
  onMenu,
  onGrab,
  onHover,
}: {
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
}) {
  const menu = useRef(onMenu);
  menu.current = onMenu;
  const press = useMemo(() => createLongPress(() => menu.current()), []);
  const open = hovered || selected;
  return (
    <button
      ref={setElement}
      className={`scene-label ${selected ? 'selected' : ''} ${hovered ? 'hovered' : ''} ${grouped ? 'grouped' : ''}`}
      data-state={agent.activity}
      data-still={still ? '1' : undefined}
      style={{ ['--accent' as string]: accent } as CSSProperties}
      title={tip}
      aria-label={label}
      aria-haspopup="menu"
      aria-expanded={menuOpen}
      onPointerDown={(e) => {
        onPointerDown(); // a moving camera would slide the tag out from under the finger
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
        onActivate({ shift: e.shiftKey, keyboard: e.detail === 0 }); // detail is 0 for Enter and Space
      }}
      onPointerEnter={() => onHover(true)}
      onPointerLeave={() => onHover(false)}
    >
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
    </button>
  );
}
