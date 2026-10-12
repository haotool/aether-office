import { useMemo, useRef, type CSSProperties } from 'react';
import type { Agent } from '@aether/contracts';
import { contextLevel } from '../environment/context.js';
import { createLongPress } from '../core/long-press.js';
import { ProviderMark, type MarkProvider } from '../core/provider-marks.js';

export const tipOf = (agent: Agent, names?: { title: string; tag: string }) =>
  names ? `${names.title} · ${names.tag}` : agent.name;

type NameTagProps = {
  agent: Agent;
  provider: MarkProvider | undefined;
  context: number | null;
  selected: boolean;
  hovered: boolean;
  grouped: boolean;
  menuOpen: boolean;
  unread: boolean;
  accent: string;
  meta: string[] | null;
  tip: string;
  still: boolean;
  label: string;
  setElement: (node: HTMLButtonElement | null) => void;
  onPointerDown: () => void;
  onActivate: (how: { shift: boolean; keyboard: boolean }) => void;
  onMenu: () => void;
  onGrab: (event: PointerEvent) => boolean;
  onHover: (on: boolean) => void;
};

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
        props.onActivate({ shift: e.shiftKey, keyboard: e.detail === 0 });
      }}
      onPointerEnter={() => onHover(true)}
      onPointerLeave={() => onHover(false)}
    >
      <TagFace {...props} open={hovered || selected} />
    </button>
  );
}
