/**
 * Pure. The width of the desktop session panel: the limits, the default for a window, snapping to the default, the
 * keyboard steps, and a stored value read back safely. The drag itself is `PanelResizer.tsx`.
 */
export const PANEL_MIN = 320;
const PANEL_MAX = 720;
/** The panel never takes more than this share of the window: the office is the home. */
const PANEL_MAX_SHARE = 0.6;
/** The collapsed rail: a re-open button and the badges. */
export const PANEL_RAIL = 48;
/** A drag this close to the default settles on it. */
export const PANEL_SNAP = 8;
const PANEL_STEP = 16;
const PANEL_STEP_LARGE = 64;
/** At or below this window width the panel lies over the office and is not resizable. */
export const PANEL_OVERLAY_MAX = 1000;

/** What the panel was before it could be resized: wider on a big screen, narrower on a small one. */
export const defaultPanelWidth = (viewport: number): number =>
  viewport >= 1800 ? 440 : viewport <= 1250 ? PANEL_MIN : 380;

export const panelMax = (viewport: number): number =>
  Math.max(PANEL_MIN, Math.min(PANEL_MAX, Math.floor(viewport * PANEL_MAX_SHARE)));

export const clampPanel = (width: number, viewport: number): number =>
  Math.round(Math.min(panelMax(viewport), Math.max(PANEL_MIN, width)));

/** Near the default, settle on it. */
export function snapPanel(width: number, viewport: number): number {
  const base = defaultPanelWidth(viewport);
  return Math.abs(width - base) <= PANEL_SNAP ? base : width;
}

/** The width a drag gives: the panel's left edge follows the pointer, so moving left widens it. */
export const dragPanel = (
  startWidth: number,
  startX: number,
  x: number,
  viewport: number,
): number => snapPanel(clampPanel(startWidth + (startX - x), viewport), viewport);

type PanelKey = 'ArrowLeft' | 'ArrowRight' | 'Home' | 'End';
export const isPanelKey = (key: string): key is PanelKey =>
  key === 'ArrowLeft' || key === 'ArrowRight' || key === 'Home' || key === 'End';

/** The width after a key: Left widens (the handle is the panel's left edge), Right narrows; Shift takes big steps. */
export function stepPanel(width: number, key: PanelKey, large: boolean, viewport: number): number {
  const step = large ? PANEL_STEP_LARGE : PANEL_STEP;
  if (key === 'Home') return PANEL_MIN;
  if (key === 'End') return panelMax(viewport);
  return clampPanel(width + (key === 'ArrowLeft' ? step : -step), viewport);
}

/** The width in force: the person's choice (if it is a usable number), else the default, kept inside the window. */
export function effectivePanelWidth(stored: unknown, viewport: number): number {
  return typeof stored === 'number' && Number.isFinite(stored)
    ? clampPanel(stored, viewport)
    : clampPanel(defaultPanelWidth(viewport), viewport);
}
