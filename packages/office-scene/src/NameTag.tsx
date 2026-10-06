import { useMemo, useRef } from 'react';
import type { Agent } from '@aether/contracts';
import { contextLevel } from './context.js';
import { createLongPress } from './long-press.js';
import { ProviderMark, type MarkProvider } from './provider-marks.js';

/**
 * A member's name tag over the scene: its colour dot, the provider's mark (shown by CSS only when the camera is close or
 * the tag is selected or hovered), the name, and on hover or selection the share of the context window in use.
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
  detail,
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
  /** The small line under the name (what it is doing), when there is one to show. */
  detail: string | null | undefined;
  /** What a screen reader says: name, role, state. */
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
  return (
    <button
      ref={setElement}
      className={`scene-label ${selected ? 'selected' : ''} ${hovered ? 'hovered' : ''} ${grouped ? 'grouped' : ''} ${unread ? 'unread' : ''}`}
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
      <span style={{ background: agent.color }} />
      {provider && <ProviderMark provider={provider} />}
      {agent.name}
      {(hovered || selected) && context !== null && (
        <b className="label-ctx" data-level={contextLevel(context)}>
          {Math.round(context)}%
        </b>
      )}
      {detail !== undefined && <small>{detail}</small>}
    </button>
  );
}
