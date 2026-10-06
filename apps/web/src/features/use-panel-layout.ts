import { useCallback, useSyncExternalStore } from 'react';
import { usePreferences } from '../state.js';
import {
  PANEL_OVERLAY_MAX,
  PANEL_RAIL,
  defaultPanelWidth,
  effectivePanelWidth,
} from './panel-width.js';

const subscribe = (notify: () => void) => {
  window.addEventListener('resize', notify);
  return () => window.removeEventListener('resize', notify);
};
const viewportWidth = () => window.innerWidth;

/**
 * Where the desktop panel stands: its width for this window (the stored choice kept inside the limits, so a shrinking
 * window pulls it in and a growing one gives it back), the collapsed rail, and whether it can be resized at all (not
 * while it lies over the office on a narrow window).
 */
export function usePanelLayout() {
  const viewport = useSyncExternalStore(subscribe, viewportWidth);
  const stored = usePreferences((s) => s.panelWidth);
  const collapsedPref = usePreferences((s) => s.panelCollapsed);
  const set = usePreferences((s) => s.set);
  const resizable = viewport > PANEL_OVERLAY_MAX;
  const collapsed = collapsedPref && resizable;
  const width = effectivePanelWidth(stored, viewport);
  /** What the office loses to the panel, in px. */
  const occupied = collapsed ? PANEL_RAIL : width;
  const setWidth = useCallback(
    (next: number) =>
      set({ panelWidth: next === defaultPanelWidth(window.innerWidth) ? null : next }),
    [set],
  );
  const setCollapsed = useCallback((next: boolean) => set({ panelCollapsed: next }), [set]);
  return { viewport, width, occupied, collapsed, resizable, setWidth, setCollapsed };
}
