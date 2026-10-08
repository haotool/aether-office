import { useEffect, useRef } from 'react';
import { useT } from '../ui/useT.js';

export type MenuRow = { id: string; label: string; hint?: string; badge?: string };

/**
 * The list over the composer for `/` commands and `@` files. It never takes focus: the textarea keeps it and drives
 * the list with the arrow keys, so typing carries on while the list narrows.
 */
export function ComposerMenu({
  title,
  rows,
  active,
  empty,
  onPick,
}: {
  title: string;
  rows: readonly MenuRow[];
  active: number;
  empty: string;
  onPick: (row: MenuRow) => void;
}) {
  const t = useT();
  const current = useRef<HTMLLIElement>(null);
  useEffect(() => {
    current.current?.scrollIntoView({ block: 'nearest' });
  }, [active]);
  return (
    <div className="composer-menu">
      <ul role="listbox" aria-label={title}>
        {rows.length === 0 && <li className="composer-menu-empty">{empty}</li>}
        {rows.map((row, i) => (
          <li
            key={row.id}
            ref={i === active ? current : undefined}
            role="option"
            aria-selected={i === active}
            className={i === active ? 'active' : undefined}
            // Keep the focus in the textarea: a click on the list must not blur it.
            onMouseDown={(e) => e.preventDefault()}
            onClick={() => onPick(row)}
          >
            <b>{row.label}</b>
            {row.badge && <i>{row.badge}</i>}
            {row.hint && <span>{row.hint}</span>}
          </li>
        ))}
      </ul>
      <p className="composer-menu-hints" aria-hidden>
        <kbd>↑↓</kbd> {t('menuHintMove')} <kbd>⏎</kbd> {t('menuHintPick')} <kbd>Esc</kbd>{' '}
        {t('menuHintClose')}
      </p>
    </div>
  );
}
