import { forwardRef } from 'react';
import { Search, X } from 'lucide-react';
import { useT } from '../../ui.js';

/** The box that narrows Settings to the rows that match; Escape empties it, "/" brings the focus here. */
export const SettingsSearch = forwardRef<
  HTMLInputElement,
  { query: string; count: number | null; onChange: (query: string) => void }
>(function SettingsSearch({ query, count, onChange }, ref) {
  const t = useT();
  return (
    <div className="ssearch" role="search">
      <Search size={16} aria-hidden="true" />
      <input
        ref={ref}
        type="search"
        value={query}
        aria-label={t('stSearch')}
        placeholder={t('stSearchPlaceholder')}
        autoComplete="off"
        spellCheck={false}
        onChange={(e) => onChange(e.target.value)}
        onKeyDown={(e) => {
          if (e.key === 'Escape' && query) {
            e.preventDefault();
            onChange('');
          }
        }}
      />
      {query && (
        <button
          type="button"
          className="icon-button"
          aria-label={t('stSearchClear')}
          onClick={() => onChange('')}
        >
          <X size={16} />
        </button>
      )}
      <span className="visually-hidden" role="status">
        {count === null ? '' : `${count} ${t('stMatches')}`}
      </span>
    </div>
  );
});
