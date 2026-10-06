import { seeded } from './random.js';
import { SANS, MONO, SCREEN_W, type ViewCtx } from './screen-theme.js';
import { fit, roundRect, text } from './screen-ui.js';

const STATE_TEXT: Record<string, string> = {
  idle: 'IDLE',
  offline: 'ENDED',
  unknown: '—',
};

/**
 * A screen that is not working: a wallpaper drawn from the member's id (bubbles, a grid or bands, drifting slowly) with the
 * real title, state, quiet minutes and context share on it.
 */
export function drawLock(c: ViewCtx): void {
  const { g, p, box, facts, profile } = c;
  g.fillStyle = p.bg;
  g.fillRect(box.x, box.y, SCREEN_W, box.h);
  const r = seeded(`${c.seed}:wallpaper`);
  const t = c.moving ? c.now / 4000 : 0;
  g.save();
  g.beginPath();
  g.rect(box.x, box.y, SCREEN_W, box.h);
  g.clip();
  g.globalAlpha = 0.22;
  g.fillStyle = c.accent;
  g.strokeStyle = c.accent;
  g.lineWidth = 1;
  if (profile.wallpaper === 0)
    for (let i = 0; i < 9; i++) {
      const x = r() * SCREEN_W;
      const y = box.y + (((r() * box.h + t * (6 + i * 2) * 4) % (box.h + 40)) - 20);
      g.beginPath();
      g.arc(x, y, 8 + r() * 22, 0, Math.PI * 2);
      g.fill();
    }
  else if (profile.wallpaper === 1)
    for (let i = 0; i < 14; i++) {
      g.beginPath();
      g.moveTo(i * 48 + ((t * 8) % 48), box.y);
      g.lineTo(i * 48 - 120 + ((t * 8) % 48), box.y + box.h);
      g.stroke();
    }
  else
    for (let i = 0; i < 4; i++) {
      g.beginPath();
      g.moveTo(0, box.y + 70 + i * 54);
      for (let x = 0; x <= SCREEN_W; x += 40)
        g.lineTo(x, box.y + 70 + i * 54 + Math.sin(x / 90 + t + i) * 18);
      g.lineTo(SCREEN_W, box.y + box.h);
      g.lineTo(0, box.y + box.h);
      g.fill();
    }
  g.restore();
  g.fillStyle = p.bg;
  g.globalAlpha = 0.6;
  g.fillRect(box.x, box.y, SCREEN_W, box.h);
  g.globalAlpha = 1;

  const cx = SCREEN_W / 2;
  g.strokeStyle = p.dim;
  g.lineWidth = 4;
  g.beginPath();
  g.arc(cx, 116, 16, Math.PI, 0);
  g.stroke();
  g.fillStyle = p.dim;
  g.fillRect(cx - 24, 116, 48, 36);
  g.textAlign = 'center';
  g.font = `600 22px ${SANS}`;
  g.fillStyle = p.dim;
  g.fillText(fit(g, facts.title ?? facts.repo, SCREEN_W - 120), cx, 198);
  g.font = `18px ${MONO}`;
  const state = STATE_TEXT[facts.state] ?? '';
  g.fillText(
    facts.state === 'idle' && facts.quietMinutes !== null
      ? `${state} · quiet ${facts.quietMinutes}m`
      : state,
    cx,
    228,
  );
  if (facts.contextPercent !== null)
    g.fillText(`context ${Math.round(facts.contextPercent)}%`, cx, 254);
  g.textAlign = 'left';
}

/** The prompt a member is waiting on: the tool and its short target are the session's own words; the dialog is a picture of asking. */
export function drawApproval(c: ViewCtx): void {
  const { g, p } = c;
  g.fillStyle = '#000000';
  g.globalAlpha = 0.45;
  g.fillRect(0, 31, SCREEN_W, 315);
  g.globalAlpha = 1;
  const x = 110;
  const y = 96;
  const w = SCREEN_W - 220 - 40;
  g.fillStyle = p.panel;
  roundRect(g, x, y, w, 148, 10);
  g.fill();
  g.strokeStyle = p.warn;
  g.lineWidth = 2;
  g.stroke();
  text(g, '⚠ Permission requested', x + 18, y + 28, p.warn, 14, SANS, '700');
  text(
    g,
    fit(g, `Allow ${c.facts.tool ?? c.work.tool ?? 'this tool'}?`, w - 36),
    x + 18,
    y + 58,
    p.text,
    18,
    SANS,
    '600',
  );
  g.font = `13px ${MONO}`;
  g.fillStyle = p.dim;
  if (c.work.target) g.fillText(fit(g, c.work.target, w - 36), x + 18, y + 84);
  const pulse = c.moving ? 0.75 + 0.25 * Math.sin(c.now / 350) : 1;
  g.fillStyle = p.line;
  roundRect(g, x + w - 190, y + 104, 80, 28, 6);
  g.fill();
  text(g, 'Deny', x + w - 168, y + 123, p.text, 13, SANS);
  g.fillStyle = p.add;
  g.globalAlpha = pulse;
  roundRect(g, x + w - 98, y + 104, 80, 28, 6);
  g.fill();
  g.globalAlpha = 1;
  text(g, 'Allow', x + w - 76, y + 123, p.bg, 13, SANS, '600');
}

const TOAST_PERIOD_MS = 55_000;
const TOAST_MS = 3600;
const TOAST_CHANCE = 0.6;

/** A notification sliding in now and then: when is seeded, what it says is not drawn (it is only the idea of one). */
export function drawToast(c: ViewCtx): void {
  const bucket = Math.floor(c.now / TOAST_PERIOD_MS);
  const r = seeded(`${c.seed}:toast:${bucket}`);
  if (r() > TOAST_CHANCE) return;
  const age = c.now - bucket * TOAST_PERIOD_MS - r() * (TOAST_PERIOD_MS - TOAST_MS);
  if (age < 0 || age > TOAST_MS) return;
  const { g, p } = c;
  const slide = Math.min(1, age / 300, (TOAST_MS - age) / 300);
  const x = SCREEN_W - 214 + (1 - slide) * 220;
  g.fillStyle = p.panel;
  roundRect(g, x, 40, 200, 36, 8);
  g.fill();
  g.strokeStyle = p.line;
  g.lineWidth = 1;
  g.stroke();
  g.fillStyle = [c.accent, p.info, p.add, p.warn][Math.floor(r() * 4)]!;
  g.beginPath();
  g.arc(x + 18, 58, 8, 0, Math.PI * 2);
  g.fill();
  g.fillStyle = p.text;
  g.fillRect(x + 36, 50, 90 + r() * 50, 5);
  g.fillStyle = p.dim;
  g.fillRect(x + 36, 62, 60 + r() * 60, 4);
}
