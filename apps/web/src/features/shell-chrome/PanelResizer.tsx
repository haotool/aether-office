import { useRef, type KeyboardEvent, type PointerEvent } from 'react';
import { useT } from '../../ui/useT.js';
import {
  PANEL_MIN,
  defaultPanelWidth,
  dragPanel,
  isPanelKey,
  panelMax,
  stepPanel,
} from './panel-width.js';

type Drag = { id: number; startX: number; startWidth: number; width: number; frame: number };

function usePanelDrag(width: number, viewport: number, onCommit: (width: number) => void) {
  const handle = useRef<HTMLDivElement>(null);
  const drag = useRef<Drag | null>(null);
  const host = () => handle.current?.closest<HTMLElement>('.app-body') ?? null;

  const paint = (next: number) => {
    host()?.style.setProperty('--panel-w', `${next}px`);
    handle.current?.setAttribute('aria-valuenow', String(next));
  };
  const finish = (commit: boolean) => {
    const d = drag.current;
    if (!d) return;
    drag.current = null;
    cancelAnimationFrame(d.frame);
    delete host()?.dataset['resizing'];
    if (commit) onCommit(d.width);
    else paint(d.startWidth);
  };

  const onPointerDown = (e: PointerEvent<HTMLDivElement>) => {
    if (e.button !== 0 || drag.current) return;
    e.currentTarget.setPointerCapture(e.pointerId);
    drag.current = { id: e.pointerId, startX: e.clientX, startWidth: width, width, frame: 0 };
    host()?.setAttribute('data-resizing', '');
  };
  const onPointerMove = (e: PointerEvent<HTMLDivElement>) => {
    const d = drag.current;
    if (!d || d.id !== e.pointerId) return;
    d.width = dragPanel(d.startWidth, d.startX, e.clientX, viewport);
    if (!d.frame)
      d.frame = requestAnimationFrame(() => {
        d.frame = 0;
        paint(d.width);
      });
  };
  const onPointerUp = (e: PointerEvent<HTMLDivElement>) => {
    const d = drag.current;
    if (!d || d.id !== e.pointerId) return;
    cancelAnimationFrame(d.frame);
    paint(d.width);
    finish(true);
  };
  return { handle, drag, finish, pointer: { onPointerDown, onPointerMove, onPointerUp } };
}

export function PanelResizer({
  width,
  viewport,
  onCommit,
  onCollapse,
}: {
  width: number;
  viewport: number;
  onCommit: (width: number) => void;
  onCollapse: () => void;
}) {
  const t = useT();
  const { handle, drag, finish, pointer } = usePanelDrag(width, viewport, onCommit);

  const activate = () =>
    width === defaultPanelWidth(viewport) ? onCollapse() : onCommit(defaultPanelWidth(viewport));
  const onKeyDown = (e: KeyboardEvent<HTMLDivElement>) => {
    if (e.key === 'Escape' && drag.current) return finish(false);
    if (e.key === 'Enter') return activate();
    if (!isPanelKey(e.key)) return;
    e.preventDefault();
    onCommit(stepPanel(width, e.key, e.shiftKey, viewport));
  };

  return (
    <div
      ref={handle}
      className="panel-resizer"
      role="separator"
      aria-orientation="vertical"
      aria-label={t('panelResize')}
      aria-valuemin={PANEL_MIN}
      aria-valuemax={panelMax(viewport)}
      aria-valuenow={width}
      tabIndex={0}
      {...pointer}
      onPointerCancel={() => finish(false)}
      onLostPointerCapture={() => finish(false)}
      onDoubleClick={activate}
      onKeyDown={onKeyDown}
    />
  );
}
