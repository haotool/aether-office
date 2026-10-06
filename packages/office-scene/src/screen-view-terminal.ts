import {
  revealedLines,
  terminalOutput,
  type TermContext,
  type Tone,
} from './screen-terminal-gen.js';
import { kindOf } from './screen-work.js';
import { MONO, type Palette, type ViewCtx } from './screen-theme.js';
import { fit } from './screen-ui.js';
import { caretOn } from './screen-motion.js';

const ROW = 14;
const PAD = 10;
const SPINNER = '⠋⠙⠹⠸⠼⠴⠦⠧⠇⠏';
const SHELL_KINDS = new Set(['shell', 'git', 'test']);

const toneColor = (p: Palette, tone: Tone, accent: string): string =>
  ({ text: p.text, dim: p.dim, add: p.add, del: p.del, warn: p.warn, accent })[tone];

type Row = { text: string; tone: Tone };

/** The terminal's context from real facts: the branch, the files really edited, the ports really open. */
export function termContext(c: ViewCtx): TermContext {
  const edited = c.facts.recent.flatMap((call) =>
    kindOf(call) === 'edit' && call.target ? [call.target] : [],
  );
  return {
    branch: c.facts.branch,
    edited: [...new Set(edited)],
    ports: c.facts.ports,
    uncommitted: c.facts.uncommitted,
  };
}

/** A shell: the commands the member really ran (their first words) with made-up output under them, the current one streaming. */
export function drawTerminal(c: ViewCtx): void {
  const { g, p, box, facts } = c;
  g.fillStyle = p.bg;
  g.fillRect(box.x, box.y, box.w, box.h);
  const context = termContext(c);
  const commands = facts.recent.filter((call) => SHELL_KINDS.has(kindOf(call)) && call.target);
  const running = c.work.head !== null && facts.tool !== null;
  const current = running ? commands[commands.length - 1] : undefined;
  const earlier = commands.slice(running ? -4 : -3, running ? -1 : undefined);

  const rows: Row[] = [];
  for (const call of earlier) {
    rows.push({ text: `$ ${call.target}`, tone: 'accent' });
    for (const l of terminalOutput(c.seed, call.target, context, 3))
      rows.push({ text: l.text, tone: l.tone === 'text' ? 'dim' : l.tone });
  }
  if (current) {
    rows.push({ text: `$ ${current.target}`, tone: 'accent' });
    const count = c.moving ? revealedLines(`${c.seed}:${current.target}`, c.elapsed) : 12;
    for (const l of terminalOutput(c.seed, current.target, context, count)) rows.push(l);
  } else if (c.work.head) {
    rows.push({ text: `$ ${c.work.head}`, tone: 'accent' });
    for (const l of terminalOutput(c.seed, c.work.head, context, 10)) rows.push(l);
  }

  const room = Math.floor((box.h - PAD * 2 - ROW) / ROW);
  const shown = rows.slice(-room);
  g.save();
  g.beginPath();
  g.rect(box.x, box.y, box.w, box.h);
  g.clip();
  shown.forEach((row, i) => {
    const y = box.y + PAD + (i + 1) * ROW - 3;
    g.font = `12px ${MONO}`;
    g.fillStyle = toneColor(p, row.tone, c.accent);
    g.fillText(fit(g, row.text, box.w - PAD * 2), box.x + PAD, y);
  });
  const promptY = box.y + PAD + (shown.length + 1) * ROW - 3;
  const where = `${facts.repo}${facts.branch ? ` ⎇ ${facts.branch}` : ''}`;
  g.font = `12px ${MONO}`;
  g.fillStyle = p.add;
  g.fillText(fit(g, where, box.w - 60), box.x + PAD, promptY);
  const promptX = box.x + PAD + g.measureText(`${where} `).width;
  g.fillStyle = p.text;
  g.fillText(running ? SPINNER[Math.floor(c.now / 100) % SPINNER.length]! : '$', promptX, promptY);
  if (!running && (!c.moving || caretOn(c.now))) g.fillRect(promptX + 10, promptY - 10, 7, 12);
  g.restore();
}
