import { useState, type ReactNode } from 'react';
import { Check, Copy } from 'lucide-react';
import { copyText } from '../browser-compat.js';
import { useT } from '../ui.js';
import { diffKind, isDiff, parseMarkdown, type Inline } from './md-parse.js';

const inline = (parts: Inline[]): ReactNode[] =>
  parts.map((p, i) =>
    p.type === 'code' ? (
      <code key={i}>{p.text}</code>
    ) : p.type === 'bold' ? (
      <strong key={i}>{p.text}</strong>
    ) : p.type === 'italic' ? (
      <em key={i}>{p.text}</em>
    ) : (
      p.text
    ),
  );

/** A fenced block: its language, a copy button, and +/- colouring when it is a diff. */
function CodeBlock({ text, lang }: { text: string; lang: string | undefined }) {
  const t = useT();
  const [copied, setCopied] = useState(false);
  const copy = async () => {
    setCopied(await copyText(text));
    setTimeout(() => setCopied(false), 1500);
  };
  return (
    <figure className="code-block">
      <figcaption>
        <span>{lang ?? ''}</span>
        <button type="button" className="code-copy" onClick={() => void copy()}>
          {copied ? <Check size={13} aria-hidden /> : <Copy size={13} aria-hidden />}
          {copied ? t('copied') : t('codeCopy')}
        </button>
      </figcaption>
      <pre tabIndex={0}>
        <code>
          {isDiff(lang)
            ? text.split('\n').map((line, i) => (
                <span key={i} className={`diff-line ${diffKind(line)}`}>
                  {line || ' '}
                </span>
              ))
            : text}
        </code>
      </pre>
    </figure>
  );
}

/** An agent's reply, rendered as elements (never as HTML), so nothing it says can inject markup. */
export function Markdown({ text }: { text: string }) {
  return (
    <div className="markdown">
      {parseMarkdown(text).map((block, i) => {
        if (block.type === 'code') return <CodeBlock key={i} text={block.text} lang={block.lang} />;
        if (block.type === 'list') {
          const List = block.ordered ? 'ol' : 'ul';
          return (
            <List key={i}>
              {block.items.map((item, j) => (
                <li key={j}>{inline(item)}</li>
              ))}
            </List>
          );
        }
        return block.type === 'heading' ? (
          <p key={i} className="md-heading">
            {inline(block.inline)}
          </p>
        ) : (
          <p key={i}>{inline(block.inline)}</p>
        );
      })}
    </div>
  );
}
