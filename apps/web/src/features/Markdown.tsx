import { useState } from 'react';
import { Check, Copy } from 'lucide-react';
import type { ListItem, MdBlock } from '@aether/kernel';
import { copyText } from '../browser-compat.js';
import { useT } from '../ui.js';
import { Inline } from './MdInline.js';
import { diffKind, isDiff, parseMarkdown } from './md-parse.js';

/** Each block of a reply that is revealed starts its fade a little after the one above it. */
const BLOCK_STAGGER_MS = 120;
const BLOCK_STAGGER_MAX = 10;

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

function Item({ item, delay }: { item: ListItem; delay: number | null }) {
  const t = useT();
  const [first, ...rest] = item.blocks;
  const lead = first?.type === 'paragraph' ? first : null;
  return (
    <li className={item.checked !== null ? 'task' : undefined}>
      {item.checked !== null && (
        <span className="md-task" role="img" aria-label={item.checked ? t('mdDone') : t('mdTodo')}>
          {item.checked ? '☑' : '☐'}
        </span>
      )}
      {lead && <Inline spans={lead.inline} delay={delay} />}
      <Blocks blocks={lead ? rest : item.blocks} delay={delay} />
    </li>
  );
}

function Table({
  block,
  delay,
}: {
  block: Extract<MdBlock, { type: 'table' }>;
  delay: number | null;
}) {
  const align = (i: number) => ({ textAlign: block.align[i] ?? undefined });
  return (
    <div className="md-table">
      <table>
        <thead>
          <tr>
            {block.head.map((spans, i) => (
              <th key={i} style={align(i)}>
                <Inline spans={spans} delay={delay} />
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {block.rows.map((row, r) => (
            <tr key={r}>
              {row.map((spans, i) => (
                <td key={i} style={align(i)}>
                  <Inline spans={spans} delay={delay} />
                </td>
              ))}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

function Block({ block, delay }: { block: MdBlock; delay: number | null }) {
  switch (block.type) {
    case 'code':
      return <CodeBlock text={block.text} lang={block.lang} />;
    case 'list': {
      const List = block.ordered ? 'ol' : 'ul';
      return (
        <List start={block.ordered && block.start !== 1 ? block.start : undefined}>
          {block.items.map((item, i) => (
            <Item key={i} item={item} delay={delay} />
          ))}
        </List>
      );
    }
    case 'heading':
      return (
        <p className={`md-heading level-${block.level}`}>
          <Inline spans={block.inline} delay={delay} />
        </p>
      );
    case 'table':
      return <Table block={block} delay={delay} />;
    case 'quote':
      return (
        <blockquote>
          <Blocks blocks={block.blocks} delay={delay} />
        </blockquote>
      );
    case 'rule':
      return <hr />;
    case 'paragraph':
      return (
        <p>
          <Inline spans={block.inline} delay={delay} />
        </p>
      );
  }
}

function Blocks({ blocks, delay }: { blocks: readonly MdBlock[]; delay: number | null }) {
  return blocks.map((block, i) => (
    <Block
      key={i}
      block={block}
      delay={delay === null ? null : delay + Math.min(i, BLOCK_STAGGER_MAX) * BLOCK_STAGGER_MS}
    />
  ));
}

/**
 * An agent's reply, rendered as elements (never as HTML), so nothing it says can inject markup: links are http(s) only,
 * images show their alt text and are never fetched. `reveal` fades the words in one after another, for a reply that has
 * just arrived.
 */
export function Markdown({ text, reveal = false }: { text: string; reveal?: boolean }) {
  return (
    <div className={`markdown ${reveal ? 'reveal' : ''}`}>
      <Blocks blocks={parseMarkdown(text)} delay={reveal ? 0 : null} />
    </div>
  );
}
