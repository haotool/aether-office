import { useEffect, type RefObject } from 'react';

const KEYS = new Set([
  'w',
  'a',
  's',
  'd',
  'q',
  'e',
  '=',
  '+',
  '-',
  '_',
  'shift',
  'arrowup',
  'arrowdown',
  'arrowleft',
  'arrowright',
]);

type SceneKeyActions = {
  floor: number;
  onFloor: (floor: number) => void;
  onToggleFollow: () => void;
  onToggleExploded: () => void;
  onCamera: () => void;
};

export function useSceneKeys(
  held: RefObject<Set<string>>,
  { floor, onFloor, onToggleFollow, onToggleExploded, onCamera }: SceneKeyActions,
) {
  useEffect(() => {
    const down = (event: KeyboardEvent) => {
      const target = event.target as HTMLElement | null;
      if (target && /^(input|textarea|select)$/i.test(target.tagName)) return;
      if (target?.closest('[role="menu"]')) return;
      const key = event.key.toLowerCase();
      if (event.metaKey || event.ctrlKey || event.altKey) return;
      if (key === 'shift') held.current.add(key);
      else if (KEYS.has(key)) {
        held.current.add(key);
        onCamera();
        if (key.startsWith('arrow')) event.preventDefault();
      } else if (/^[1-5]$/.test(key)) onFloor(Number(key) - 1);
      else if (key === ']' || key === 'pageup') onFloor(floor + 1);
      else if (key === '[' || key === 'pagedown') onFloor(floor - 1);
      else if (key === 'f') onToggleFollow();
      else if (key === 'x') onToggleExploded();
      else if (key === 'home' || key === '0') onFloor(floor);
    };
    const up = (event: KeyboardEvent) => held.current.delete(event.key.toLowerCase());
    const blur = () => held.current.clear();
    window.addEventListener('keydown', down);
    window.addEventListener('keyup', up);
    window.addEventListener('blur', blur);
    return () => {
      window.removeEventListener('keydown', down);
      window.removeEventListener('keyup', up);
      window.removeEventListener('blur', blur);
    };
  }, [held, floor, onFloor, onToggleFollow, onToggleExploded, onCamera]);
}
