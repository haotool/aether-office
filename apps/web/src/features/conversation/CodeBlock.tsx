import { useState, type CSSProperties } from 'react';
import { Check, Copy, TextWrap } from 'lucide-react';
import { copyText } from '../../lib/platform/browser-compat.js';
import { useT } from '../../ui/useT.js';
import { diffKind, isDiff } from './md-parse.js';

const NUMBERED_FROM = 8;
const COPIED_MS = 1500;

export function CodeBlock({ text, lang }: { text: string; lang: string | undefined }) {
  const t = useT();
  const [copied, setCopied] = useState(false);
  const [wrap, setWrap] = useState(false);
  const lines = text.split('\n');
  const numbered = lines.length > NUMBERED_FROM;
  const diff = isDiff(lang);
  const copy = async () => {
    setCopied(await copyText(text));
    setTimeout(() => setCopied(false), COPIED_MS);
  };
  return (
    <figure
      className={`code-block ${numbered ? 'numbered' : ''} ${wrap ? 'wrap' : ''}`}
      style={numbered ? ({ '--digits': String(lines.length).length } as CSSProperties) : undefined}
    >
      <figcaption>
        <span className="code-lang">{lang ?? ''}</span>
        <span className="code-tools">
          <button
            type="button"
            className="code-copy"
            aria-pressed={wrap}
            title={wrap ? t('codeScroll') : t('codeWrap')}
            aria-label={wrap ? t('codeScroll') : t('codeWrap')}
            onClick={() => setWrap(!wrap)}
          >
            <TextWrap size={13} aria-hidden />
          </button>
          <button type="button" className="code-copy" onClick={() => void copy()}>
            {copied ? <Check size={13} aria-hidden /> : <Copy size={13} aria-hidden />}
            {copied ? t('copied') : t('codeCopy')}
          </button>
        </span>
      </figcaption>
      <pre tabIndex={0}>
        <code>
          {lines.map((line, i) => (
            <span key={i} className={`code-line ${diff ? diffKind(line) : ''}`}>
              {line || ' '}
            </span>
          ))}
        </code>
      </pre>
    </figure>
  );
}
