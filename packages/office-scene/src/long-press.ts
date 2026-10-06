/** How long a finger rests on a character before it counts as a press-and-hold, and how far it may wander meanwhile. */
const LONG_PRESS_MS = 520;
const LONG_PRESS_SLOP_PX = 10;

/**
 * A press-and-hold detector for one pointer at a time. `start` arms it, a move beyond the slop (the finger is dragging
 * the camera) or `end` disarms it, and when the time runs out `onLong` fires once. The click that follows a hold is
 * the hold's own: `consumeClick` says so, once, so the caller can ignore it.
 */
export function createLongPress(onLong: () => void, ms = LONG_PRESS_MS, slop = LONG_PRESS_SLOP_PX) {
  let timer: ReturnType<typeof setTimeout> | undefined;
  let origin: { x: number; y: number } | null = null;
  let fired = false;
  const disarm = () => {
    clearTimeout(timer);
    timer = undefined;
    origin = null;
  };
  return {
    start(x: number, y: number) {
      disarm();
      fired = false;
      origin = { x, y };
      timer = setTimeout(() => {
        fired = true;
        origin = null;
        onLong();
      }, ms);
    },
    move(x: number, y: number) {
      if (origin && Math.hypot(x - origin.x, y - origin.y) > slop) disarm();
    },
    end: disarm,
    consumeClick(): boolean {
      const was = fired;
      fired = false;
      return was;
    },
  };
}
