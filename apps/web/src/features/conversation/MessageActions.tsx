import { useState } from 'react';
import { Check, Copy, FileText } from 'lucide-react';
import { toPlainPreview } from '@aether/kernel';
import { copyText } from '../../lib/platform/browser-compat.js';
import { useT } from '../../ui/useT.js';

const COPIED_MS = 1500;

export function MessageActions({ text }: { text: string }) {
  const t = useT();
  const [done, setDone] = useState<'markdown' | 'text' | null>(null);
  const copy = async (kind: 'markdown' | 'text') => {
    const body = kind === 'markdown' ? text : toPlainPreview(text, { maxLines: Infinity });
    if (await copyText(body)) {
      setDone(kind);
      setTimeout(() => setDone(null), COPIED_MS);
    }
  };
  return (
    <span className="msg-actions">
      <button
        type="button"
        aria-label={t('msgCopyMarkdown')}
        title={done === 'markdown' ? t('copied') : t('msgCopyMarkdown')}
        onClick={() => void copy('markdown')}
      >
        {done === 'markdown' ? <Check size={13} aria-hidden /> : <Copy size={13} aria-hidden />}
      </button>
      <button
        type="button"
        aria-label={t('msgCopyText')}
        title={done === 'text' ? t('copied') : t('msgCopyText')}
        onClick={() => void copy('text')}
      >
        {done === 'text' ? <Check size={13} aria-hidden /> : <FileText size={13} aria-hidden />}
      </button>
    </span>
  );
}
