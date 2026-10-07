import { useEffect, useRef, useState, type KeyboardEvent, type RefObject } from 'react';
import { ChevronDown, ChevronUp, X } from 'lucide-react';
import { useT } from '../ui.js';
import { canHighlight, findRanges, paintMatches } from './conv-find.js';

/**
 * Find in the conversation: matches in the loaded messages, painted with the browser's highlight API (no DOM is touched, so
 * nothing re-renders). `content` changes when the conversation does, which re-runs the search. Where the highlight API is
 * missing the browser's own find stays as it is.
 */
export function useConvFind(root: RefObject<HTMLElement | null>, content: unknown) {
  const [open, setOpen] = useState(false);
  const [query, setQuery] = useState('');
  const [current, setCurrent] = useState(0);
  const [ranges, setRanges] = useState<Range[]>([]);

  useEffect(() => {
    const el = root.current;
    setRanges(open && el ? findRanges(el, query) : []);
  }, [root, open, query, content]);
  const index = ranges.length ? Math.min(current, ranges.length - 1) : 0;
  useEffect(() => {
    paintMatches(ranges, index);
    return () => paintMatches([], 0);
  }, [ranges, index]);
  // Scrolls to the match when the person moves to it, not every time a poll refreshes the same conversation.
  const latest = useRef(ranges);
  latest.current = ranges;
  const found = ranges.length > 0;
  useEffect(() => {
    const at = latest.current[index]?.startContainer.parentElement;
    // A match inside a folded message opens it first, or it would be found and never seen.
    at?.closest('.long.folded')?.querySelector<HTMLElement>('.long-toggle')?.click();
    at?.scrollIntoView({ block: 'center' });
  }, [query, index, found]);

  const step = (by: number) =>
    setCurrent((i) =>
      ranges.length ? (Math.min(i, ranges.length - 1) + by + ranges.length) % ranges.length : 0,
    );
  return {
    supported: canHighlight(),
    open,
    setOpen,
    query,
    setQuery: (q: string) => {
      setQuery(q);
      setCurrent(0);
    },
    count: ranges.length,
    index,
    next: () => step(1),
    prev: () => step(-1),
  };
}

type ConvFindState = ReturnType<typeof useConvFind>;

/** The find row: a field, "3 / 12", previous and next, close. Enter goes on, Shift+Enter back, Escape closes. */
export function FindBar({ find, onClose }: { find: ConvFindState; onClose: () => void }) {
  const t = useT();
  const input = useRef<HTMLInputElement>(null);
  useEffect(() => input.current?.focus(), []);
  const onKey = (e: KeyboardEvent) => {
    if (e.key === 'Escape') onClose();
    else if (e.key === 'Enter') {
      e.preventDefault();
      if (e.shiftKey) find.prev();
      else find.next();
    }
  };
  const none = find.query.trim() !== '' && find.count === 0;
  return (
    <div className="find-bar" role="search">
      <input
        ref={input}
        type="search"
        value={find.query}
        placeholder={t('convFindPlaceholder')}
        aria-label={t('convFind')}
        onChange={(e) => find.setQuery(e.target.value)}
        onKeyDown={onKey}
      />
      <span className={`find-count ${none ? 'none' : ''}`} role="status">
        {none ? t('convFindNone') : find.count ? `${find.index + 1} / ${find.count}` : ''}
      </span>
      <button
        type="button"
        className="icon-button"
        aria-label={t('convFindPrev')}
        title={t('convFindPrev')}
        disabled={!find.count}
        onClick={find.prev}
      >
        <ChevronUp size={15} aria-hidden />
      </button>
      <button
        type="button"
        className="icon-button"
        aria-label={t('convFindNext')}
        title={t('convFindNext')}
        disabled={!find.count}
        onClick={find.next}
      >
        <ChevronDown size={15} aria-hidden />
      </button>
      <button
        type="button"
        className="icon-button"
        aria-label={t('convFindClose')}
        title={t('convFindClose')}
        onClick={onClose}
      >
        <X size={15} aria-hidden />
      </button>
    </div>
  );
}
