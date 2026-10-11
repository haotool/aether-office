import type { ThreeEvent } from '@react-three/fiber';
import { AGENT_OFFSET } from '../scene/scene-geometry.js';
import type { createLongPress } from '../core/long-press.js';

type CharacterActions = {
  onActivate: (id: string, shift: boolean) => void;
  onMenu: (id: string) => void;
  onSelect: (id: string) => void;
  onFly: (target: [number, number, number], offset: [number, number, number]) => void;
  onHoverStart: (id: string) => void;
  onHoverEnd: (id: string) => void;
  onGrab?: (id: string, event: PointerEvent) => boolean;
};

export function characterEvents(
  id: string,
  flyTo: [number, number, number],
  press: ReturnType<typeof createLongPress>,
  actions: CharacterActions,
) {
  return {
    onClick: (e: ThreeEvent<MouseEvent>) => {
      e.stopPropagation();
      if (e.delta > 4 || press.consumeClick()) return;
      actions.onActivate(id, e.shiftKey);
    },
    onContextMenu: (e: ThreeEvent<MouseEvent>) => {
      e.stopPropagation();
      e.nativeEvent.preventDefault();
      actions.onMenu(id);
    },
    onPointerDown: (e: ThreeEvent<PointerEvent>) => {
      if (e.pointerType === 'touch') press.start(e.clientX, e.clientY);
      else if (e.altKey && e.button === 0 && actions.onGrab?.(id, e.nativeEvent))
        e.stopPropagation();
    },
    onPointerMove: (e: ThreeEvent<PointerEvent>) => press.move(e.clientX, e.clientY),
    onPointerUp: press.end,
    onPointerCancel: press.end,
    onDoubleClick: (e: ThreeEvent<MouseEvent>) => {
      e.stopPropagation();
      actions.onSelect(id);
      actions.onFly(flyTo, AGENT_OFFSET);
    },
    onPointerOver: (e: ThreeEvent<PointerEvent>) => {
      e.stopPropagation();
      actions.onHoverStart(id);
      document.body.style.cursor = 'pointer';
    },
    onPointerOut: () => {
      actions.onHoverEnd(id);
      document.body.style.cursor = '';
    },
  };
}
