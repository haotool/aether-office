import { describe, expect, it } from 'vitest';
import {
  PANEL_MIN,
  PANEL_SNAP,
  clampPanel,
  defaultPanelWidth,
  dragPanel,
  effectivePanelWidth,
  panelMax,
  snapPanel,
  stepPanel,
} from '../../apps/web/src/features/shell-chrome/panel-width.js';

describe('panel width', () => {
  it('defaults by window size, as the fixed widths used to', () => {
    expect(defaultPanelWidth(1920)).toBe(440);
    expect(defaultPanelWidth(1440)).toBe(380);
    expect(defaultPanelWidth(1100)).toBe(320);
  });

  it('allows at most 720px or 60% of the window, never under the minimum', () => {
    expect(panelMax(1920)).toBe(720);
    expect(panelMax(1200)).toBe(720);
    expect(panelMax(1100)).toBe(660);
    expect(panelMax(400)).toBe(PANEL_MIN);
  });

  it('clamps into [320, max]', () => {
    expect(clampPanel(100, 1440)).toBe(320);
    expect(clampPanel(900, 1440)).toBe(720);
    expect(clampPanel(500.4, 1440)).toBe(500);
    expect(clampPanel(900, 1000)).toBe(600);
  });

  it('snaps to the default within a few pixels only', () => {
    expect(snapPanel(380 + PANEL_SNAP, 1440)).toBe(380);
    expect(snapPanel(380 - PANEL_SNAP, 1440)).toBe(380);
    expect(snapPanel(380 + PANEL_SNAP + 1, 1440)).toBe(389);
  });

  it('a drag to the left widens, to the right narrows, and ends inside the limits', () => {
    expect(dragPanel(380, 1000, 900, 1440)).toBe(480);
    expect(dragPanel(380, 1000, 1100, 1440)).toBe(320);
    expect(dragPanel(380, 1000, 0, 1440)).toBe(720);
    expect(dragPanel(380, 1000, 996, 1440)).toBe(380); // snapped
  });

  it('steps 16px with the arrows, 64px with Shift, and jumps to the ends', () => {
    expect(stepPanel(400, 'ArrowLeft', false, 1440)).toBe(416);
    expect(stepPanel(400, 'ArrowRight', false, 1440)).toBe(384);
    expect(stepPanel(400, 'ArrowLeft', true, 1440)).toBe(464);
    expect(stepPanel(400, 'ArrowRight', true, 1440)).toBe(336);
    expect(stepPanel(330, 'ArrowRight', true, 1440)).toBe(320);
    expect(stepPanel(400, 'Home', false, 1440)).toBe(320);
    expect(stepPanel(400, 'End', false, 1440)).toBe(720);
    expect(stepPanel(400, 'End', false, 1000)).toBe(600);
  });

  it('survives a storage round trip and a stored value that is not a number', () => {
    const stored = JSON.parse(JSON.stringify({ panelWidth: 512 })) as { panelWidth: unknown };
    expect(effectivePanelWidth(stored.panelWidth, 1440)).toBe(512);
    expect(effectivePanelWidth(null, 1440)).toBe(380);
    expect(effectivePanelWidth('wide', 1440)).toBe(380);
    expect(effectivePanelWidth(Number.NaN, 1440)).toBe(380);
    expect(effectivePanelWidth(Infinity, 1440)).toBe(380);
  });

  it('a window that shrinks pulls a wide panel in, and growing it again gives the width back', () => {
    expect(effectivePanelWidth(700, 1100)).toBe(660);
    expect(effectivePanelWidth(700, 1400)).toBe(700);
  });
});
