import type { CSSProperties, ReactNode } from 'react';
import type { PreviewLine, Span } from '@aether/kernel';

function Run({ span }: { span: Span }) {
  let node: ReactNode = span.text;
  if (span.code) node = <code className="chip">{node}</code>;
  if (span.strike) node = <s>{node}</s>;
  if (span.italic) node = <em>{node}</em>;
  if (span.bold) node = <b>{node}</b>;
  if (span.href) node = <span className="lk">{node}</span>;
  return node;
}

export function SpeechLines({ lines, caret }: { lines: readonly PreviewLine[]; caret: boolean }) {
  if (!lines.length)
    return caret ? (
      <div className="sl text">
        <span className="tx">
          <i className="caret" aria-hidden="true" />
        </span>
      </div>
    ) : null;
  return lines.map((line, i) => (
    <div
      key={i}
      className={`sl ${line.kind}`}
      style={line.depth ? ({ ['--depth' as string]: line.depth } as CSSProperties) : undefined}
    >
      {line.marker && (
        <span className="mk" aria-hidden="true">
          {line.marker}
        </span>
      )}
      <span className="tx">
        {line.spans.map((span, j) => (
          <Run key={j} span={span} />
        ))}
        {caret && i === lines.length - 1 && <i className="caret" aria-hidden="true" />}
      </span>
    </div>
  ));
}
