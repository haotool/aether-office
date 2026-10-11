/**
 * Small provider marks, simplified and not copies. They belong to their owners (Anthropic, OpenAI) and are used only as
 * decorative indicators next to the provider's name, never as the app's own branding (docs/legal/trademarks.md).
 */
export type MarkProvider = 'claude' | 'codex';
type Stroke = { d: string; rotate: number };

const CLAUDE: Stroke[] = [0, 45, 90, 135].map((rotate) => ({ d: 'M12 2.5v19', rotate }));
const CODEX: Stroke[] = [0, 60, 120].map((rotate) => ({
  d: 'M8.8 7.4a3.2 3.2 0 0 1 6.4 0v9.2a3.2 3.2 0 0 1-6.4 0z',
  rotate,
}));
const MARK_STROKES: Record<MarkProvider, { strokes: Stroke[]; width: number }> = {
  claude: { strokes: CLAUDE, width: 2.6 },
  codex: { strokes: CODEX, width: 1.7 },
};
const MARK_COLOR: Record<MarkProvider, string> = { claude: '#d97757', codex: '#9fc2cd' };
const MARK_NAME: Record<MarkProvider, string> = { claude: 'Claude', codex: 'Codex' };

/** The provider's name is the tooltip and a visually hidden text, so the mark never carries the meaning alone. */
export function ProviderMark({ provider, size = 14 }: { provider: MarkProvider; size?: number }) {
  const { strokes, width } = MARK_STROKES[provider];
  return (
    <>
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
        aria-hidden="true"
      >
        <title>{MARK_NAME[provider]}</title>
        {strokes.map((s) => (
          <path key={s.rotate} d={s.d} transform={`rotate(${s.rotate} 12 12)`} />
        ))}
      </svg>
      <span className="visually-hidden">{MARK_NAME[provider]}</span>
    </>
  );
}

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
