/**
 * Small identification marks of the two providers whose sessions the office shows, drawn from a few strokes on a 24 by 24
 * grid: simplified, not copies. The marks belong to their owners (Anthropic, OpenAI) and are used only to say which
 * provider a session runs on (THIRD_PARTY_NOTICES.md). The same strokes serve the page (SVG) and the desk screen (canvas).
 */
export type MarkProvider = 'claude' | 'codex';
type Stroke = { d: string; rotate: number };

/** Claude: a starburst of eight rounded rays. */
const CLAUDE: Stroke[] = [0, 45, 90, 135].map((rotate) => ({ d: 'M12 2.5v19', rotate }));
/** Codex: a knot of three interlaced loops, each a capsule outline turned by a third of a half turn. */
const CODEX: Stroke[] = [0, 60, 120].map((rotate) => ({
  d: 'M8.8 7.4a3.2 3.2 0 0 1 6.4 0v9.2a3.2 3.2 0 0 1-6.4 0z',
  rotate,
}));
const MARK_STROKES: Record<MarkProvider, { strokes: Stroke[]; width: number }> = {
  claude: { strokes: CLAUDE, width: 2.6 },
  codex: { strokes: CODEX, width: 1.7 },
};
/** Canvas colors for the desk screen: Claude's orange, Codex's near-white. */
const MARK_COLOR: Record<MarkProvider, string> = { claude: '#d97757', codex: '#e8f2f8' };
const MARK_NAME: Record<MarkProvider, string> = { claude: 'Claude', codex: 'Codex' };

/** The mark in a page: an inline SVG that takes its color from CSS (`.provider-mark[data-provider]`). */
export function ProviderMark({ provider, size = 14 }: { provider: MarkProvider; size?: number }) {
  const { strokes, width } = MARK_STROKES[provider];
  return (
    <svg
      className="provider-mark"
      data-provider={provider}
      width={size}
      height={size}
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth={width}
      strokeLinecap="round"
      strokeLinejoin="round"
      role="img"
      aria-label={MARK_NAME[provider]}
    >
      {strokes.map((s) => (
        <path key={s.rotate} d={s.d} transform={`rotate(${s.rotate} 12 12)`} />
      ))}
    </svg>
  );
}

/** Draws the mark on a canvas with its top-left corner at (x, y), `size` pixels square. */
export function drawMark(
  g: CanvasRenderingContext2D,
  provider: MarkProvider,
  x: number,
  y: number,
  size: number,
) {
  const { strokes, width } = MARK_STROKES[provider];
  g.save();
  g.translate(x, y);
  g.scale(size / 24, size / 24);
  g.strokeStyle = MARK_COLOR[provider];
  g.lineWidth = width;
  g.lineCap = g.lineJoin = 'round';
  for (const s of strokes) {
    g.save();
    g.translate(12, 12);
    g.rotate((s.rotate * Math.PI) / 180);
    g.translate(-12, -12);
    g.stroke(new Path2D(s.d));
    g.restore();
  }
  g.restore();
}
