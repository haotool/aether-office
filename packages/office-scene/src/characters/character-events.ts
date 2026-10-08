import type { ThreeEvent } from '@react-three/fiber';
import { AGENT_OFFSET } from '../scene/scene-geometry.js';
import type { createLongPress } from '../core/long-press.js';

/** What a click, a hover or a press on a character does: the page decides, a member at a desk and a subagent alike. */
type CharacterActions = {
  /** A click or tap (a second one on the chosen member opens its menu; with Shift it joins the group). */
  onActivate: (id: string, shift: boolean) => void;
  /** Right click, or a finger held down on the member. */
  onMenu: (id: string) => void;
  onSelect: (id: string) => void;
  onFly: (target: [number, number, number], offset: [number, number, number]) => void;
  onHoverStart: (id: string) => void;
  onHoverEnd: (id: string) => void;
  /** A press with Alt held: the start of dragging the member's desk to another seat; false when dragging is not allowed. */
  onGrab?: (id: string, event: PointerEvent) => boolean;
};

/**
 * The pointer events of one character: a click chooses, a hold or right click opens the menu, a double click flies the
 * camera in to `flyTo`, hovering lights the character's name tag.
 */
export function characterEvents(
  id: string,
  flyTo: [number, number, number],
  press: ReturnType<typeof createLongPress>,
  actions: CharacterActions,
) {
  return {
    onClick: (e: ThreeEvent<MouseEvent>) => {
      e.stopPropagation();
      // A click that ends an orbit drag, or the end of a press-and-hold, is not a choice.
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
