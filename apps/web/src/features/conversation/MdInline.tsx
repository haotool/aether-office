import { Fragment, type ReactNode } from 'react';
import { splitWords, type Span } from '@aether/kernel';

/** A word fades in this long after the one before it; the stagger stops growing after STAGGER_MAX words. */
const STAGGER_MS = 14;
const STAGGER_MAX = 50;

/** The words of a run as elements that fade in one after another: the stream-like reveal of a reply that just arrived. */
const words = (text: string, delay: number): ReactNode[] =>
  splitWords(text).map((word, i) => (
    <span
      key={i}
      className="w"
      style={{ animationDelay: `${delay + Math.min(i, STAGGER_MAX) * STAGGER_MS}ms` }}
    >
      {word}
    </span>
  ));

/** One run of text with its styles as nested elements. Only http(s) links reach here with an address. */
function Run({ span, delay }: { span: Span; delay: number | null }) {
  let node: ReactNode = delay !== null && !span.code ? words(span.text, delay) : span.text;
  if (span.code) node = <code>{node}</code>;
  if (span.strike) node = <del>{node}</del>;
  if (span.italic) node = <em>{node}</em>;
  if (span.bold) node = <strong>{node}</strong>;
  if (span.href)
    node = (
      <a href={span.href} target="_blank" rel="noopener noreferrer">
        {node}
      </a>
    );
  return node;
}

/** Styled runs as elements; `delay` (ms) starts the word-by-word fade-in, null shows the text at once. */
export function Inline({ spans, delay }: { spans: readonly Span[]; delay: number | null }) {
  return spans.map((span, i) => (
    <Fragment key={i}>
      <Run span={span} delay={delay} />
    </Fragment>
  ));
}
