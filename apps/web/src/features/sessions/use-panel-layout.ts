import { useCallback, useSyncExternalStore } from 'react';
import { usePreferences } from '../../lib/preferences/state.js';
import {
  PANEL_OVERLAY_MAX,
  PANEL_RAIL,
  defaultPanelWidth,
  effectivePanelWidth,
} from '../shell-chrome/panel-width.js';

const subscribe = (notify: () => void) => {
  window.addEventListener('resize', notify);
  return () => window.removeEventListener('resize', notify);
};
const viewportWidth = () => window.innerWidth;

export function usePanelLayout() {
  const viewport = useSyncExternalStore(subscribe, viewportWidth);
  const stored = usePreferences((s) => s.panelWidth);
  const collapsedPref = usePreferences((s) => s.panelCollapsed);
  const set = usePreferences((s) => s.set);
  const resizable = viewport > PANEL_OVERLAY_MAX;
  const collapsed = collapsedPref && resizable;
  const width = effectivePanelWidth(stored, viewport);
  const occupied = collapsed ? PANEL_RAIL : width;
  const setWidth = useCallback(
    (next: number) =>
      set({ panelWidth: next === defaultPanelWidth(window.innerWidth) ? null : next }),
    [set],
  );
  const setCollapsed = useCallback((next: boolean) => set({ panelCollapsed: next }), [set]);
  return { viewport, width, occupied, collapsed, resizable, setWidth, setCollapsed };
}
