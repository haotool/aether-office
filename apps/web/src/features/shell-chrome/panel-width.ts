export const PANEL_MIN = 320;
const PANEL_MAX = 720;
const PANEL_MAX_SHARE = 0.6;
export const PANEL_RAIL = 48;
export const PANEL_SNAP = 8;
const PANEL_STEP = 16;
const PANEL_STEP_LARGE = 64;
export const PANEL_OVERLAY_MAX = 1000;

export const defaultPanelWidth = (viewport: number): number =>
  viewport >= 1800 ? 440 : viewport <= 1250 ? PANEL_MIN : 380;

export const panelMax = (viewport: number): number =>
  Math.max(PANEL_MIN, Math.min(PANEL_MAX, Math.floor(viewport * PANEL_MAX_SHARE)));

export const clampPanel = (width: number, viewport: number): number =>
  Math.round(Math.min(panelMax(viewport), Math.max(PANEL_MIN, width)));

export function snapPanel(width: number, viewport: number): number {
  const base = defaultPanelWidth(viewport);
  return Math.abs(width - base) <= PANEL_SNAP ? base : width;
}

export const dragPanel = (
  startWidth: number,
  startX: number,
  x: number,
  viewport: number,
): number => snapPanel(clampPanel(startWidth + (startX - x), viewport), viewport);

type PanelKey = 'ArrowLeft' | 'ArrowRight' | 'Home' | 'End';
export const isPanelKey = (key: string): key is PanelKey =>
  key === 'ArrowLeft' || key === 'ArrowRight' || key === 'Home' || key === 'End';

export function stepPanel(width: number, key: PanelKey, large: boolean, viewport: number): number {
  const step = large ? PANEL_STEP_LARGE : PANEL_STEP;
  if (key === 'Home') return PANEL_MIN;
  if (key === 'End') return panelMax(viewport);
  return clampPanel(width + (key === 'ArrowLeft' ? step : -step), viewport);
}

export function effectivePanelWidth(stored: unknown, viewport: number): number {
  return typeof stored === 'number' && Number.isFinite(stored)
    ? clampPanel(stored, viewport)
    : clampPanel(defaultPanelWidth(viewport), viewport);
}
