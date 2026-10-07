import type { Seat } from '../director.js';
import type { LifeContext, LifeInput } from './signals.js';

/** What the scheduler may ask about the office, answered from the seats the scene has right now. */
export function lifeContext(
  seats: ReadonlyMap<string, Seat>,
  view: { floor: number; exploded: boolean },
  input: Pick<LifeInput, 'names' | 'idle'>,
  zh: boolean,
): LifeContext {
  return {
    floorOf: (member) => seats.get(member)?.floor ?? null,
    visible: (member) => {
      const seat = seats.get(member);
      return !!seat && (view.exploded || seat.floor === view.floor);
    },
    idleOn: (floor) => input.idle.filter((id) => seats.get(id)?.floor === floor),
    nameOf: (member) => input.names[member] ?? member,
    zh,
  };
}
