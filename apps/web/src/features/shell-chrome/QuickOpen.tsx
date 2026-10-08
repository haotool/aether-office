import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { Modal } from '../../ui/Modal.js';
import { useT } from '../../ui/useT.js';
import { matchItems, type QuickItem } from '../operations/quick-match.js';

/** ⌘K / Ctrl+K: jump to a page, a project or a local session by typing part of its name. */
export function QuickOpen({
  items,
  onClose,
}: {
  items: readonly QuickItem[];
  onClose: () => void;
}) {
  const t = useT();
  const navigate = useNavigate();
  const [query, setQuery] = useState('');
  const [active, setActive] = useState(0);
  const found = matchItems(items, query);
  const go = (item: QuickItem | undefined) => {
    if (!item) return;
    onClose();
    navigate(item.to);
  };
  return (
    <Modal title={t('quickOpen')} onClose={onClose}>
      <input
        type="search"
        className="quick-input"
        aria-label={t('quickOpen')}
        placeholder={t('quickOpenHint')}
        value={query}
        onChange={(e) => {
          setQuery(e.target.value);
          setActive(0);
        }}
        onKeyDown={(e) => {
          if (e.key === 'ArrowDown') setActive((i) => Math.min(i + 1, found.length - 1));
          else if (e.key === 'ArrowUp') setActive((i) => Math.max(i - 1, 0));
          else if (e.key === 'Enter') go(found[active]);
          else return;
          e.preventDefault();
        }}
      />
      <ul className="quick-list" role="listbox" aria-label={t('quickOpen')}>
        {found.map((item, i) => (
          <li key={item.id} role="option" aria-selected={i === active}>
            <button onClick={() => go(item)} onMouseEnter={() => setActive(i)}>
              <span>{item.label}</span>
              <small>{item.hint}</small>
            </button>
          </li>
        ))}
      </ul>
    </Modal>
  );
}
