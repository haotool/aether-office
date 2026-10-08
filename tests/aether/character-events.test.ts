import { describe, expect, it, vi } from 'vitest';
import { DEPARTMENTS } from '../../packages/kernel/src/index.js';
import { characterEvents } from '../../packages/office-scene/src/characters/character-events.js';
import { ringFor } from '../../packages/office-scene/src/characters/character-ring.js';
import { createLongPress } from '../../packages/office-scene/src/core/long-press.js';
import {
  AGENT_OFFSET,
  departmentAt,
} from '../../packages/office-scene/src/scene/scene-geometry.js';

type Fake = Record<string, unknown>;
const event = (over: Fake = {}) => ({
  stopPropagation: vi.fn(),
  delta: 0,
  shiftKey: false,
  altKey: false,
  button: 0,
  pointerType: 'mouse',
  clientX: 5,
  clientY: 6,
  nativeEvent: { preventDefault: vi.fn() },
  ...over,
});
const actions = () => ({
  onActivate: vi.fn(),
  onMenu: vi.fn(),
  onSelect: vi.fn(),
  onFly: vi.fn(),
  onHoverStart: vi.fn(),
  onHoverEnd: vi.fn(),
  onGrab: vi.fn(() => true),
});
// The handlers take three's event type; a plain object with the fields they read stands in for it.
const wire = (a: ReturnType<typeof actions>) =>
  characterEvents(
    'm1',
    [1, 2, 3],
    createLongPress(() => a.onMenu('m1')),
    a,
  ) as unknown as Record<string, (e: ReturnType<typeof event>) => void>;

describe('the pointer events of a character', () => {
  it('chooses on a click, with Shift for the group, and ignores the end of an orbit drag', () => {
    const a = actions();
    const on = wire(a);
    on.onClick!(event({ shiftKey: true }));
    expect(a.onActivate).toHaveBeenCalledWith('m1', true);
    on.onClick!(event({ delta: 5 }));
    expect(a.onActivate).toHaveBeenCalledTimes(1);
  });

  it('opens the menu on a right click and keeps the browser menu away', () => {
    const a = actions();
    const e = event();
    wire(a).onContextMenu!(e);
    expect(a.onMenu).toHaveBeenCalledWith('m1');
    expect(e.nativeEvent.preventDefault).toHaveBeenCalled();
    expect(e.stopPropagation).toHaveBeenCalled();
  });

  it('grabs the desk on Alt and the primary button, and stops the press reaching the camera only when grabbed', () => {
    const a = actions();
    const on = wire(a);
    const grabbed = event({ altKey: true });
    on.onPointerDown!(grabbed);
    expect(a.onGrab).toHaveBeenCalledWith('m1', grabbed.nativeEvent);
    expect(grabbed.stopPropagation).toHaveBeenCalled();
    a.onGrab.mockReturnValue(false);
    const refused = event({ altKey: true });
    on.onPointerDown!(refused);
    expect(refused.stopPropagation).not.toHaveBeenCalled();
    const plain = event();
    on.onPointerDown!(plain);
    expect(a.onGrab).toHaveBeenCalledTimes(2);
  });

  it('flies in on a double click and lights the name tag while the pointer is over', () => {
    const a = actions();
    const on = wire(a);
    on.onDoubleClick!(event());
    expect(a.onSelect).toHaveBeenCalledWith('m1');
    expect(a.onFly).toHaveBeenCalledWith([1, 2, 3], AGENT_OFFSET);
    const page = { body: { style: { cursor: '' } } };
    vi.stubGlobal('document', page);
    on.onPointerOver!(event());
    expect(a.onHoverStart).toHaveBeenCalledWith('m1');
    expect(page.body.style.cursor).toBe('pointer');
    on.onPointerOut!(event());
    expect(a.onHoverEnd).toHaveBeenCalledWith('m1');
    expect(page.body.style.cursor).toBe('');
    vi.unstubAllGlobals();
  });

  it('works for a subagent too, which cannot be grabbed', () => {
    const a = actions();
    const { onGrab: _onGrab, ...subagent } = a;
    const on = characterEvents(
      's1',
      [0, 0, 0],
      createLongPress(() => a.onMenu('s1')),
      subagent,
    ) as unknown as Record<string, (e: ReturnType<typeof event>) => void>;
    const e = event({ altKey: true });
    on.onPointerDown!(e);
    expect(e.stopPropagation).not.toHaveBeenCalled();
  });
});

describe('who wears a ring, and a department by floor', () => {
  it('prefers the group, then the chosen, then the hovered', () => {
    const view = { group: new Set(['a']), selectedId: 'b', hoveredId: 'c' };
    expect(ringFor('a', view)).toBe('group');
    expect(ringFor('b', view)).toBe('selected');
    expect(ringFor('c', view)).toBe('hover');
    expect(ringFor('d', view)).toBeNull();
    expect(ringFor('b', { ...view, group: new Set(['b']) })).toBe('group');
  });

  it('finds the department of a floor, and the first one for a floor that has none', () => {
    expect(departmentAt(1)).toBe(DEPARTMENTS[1]);
    expect(departmentAt(99)).toBe(DEPARTMENTS[0]);
  });
});
