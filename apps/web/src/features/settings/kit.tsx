import {
  createContext,
  useContext,
  useEffect,
  useId,
  useRef,
  useState,
  type ReactNode,
} from 'react';
import { Check, Copy, Info, Lock, Minus, TriangleAlert } from 'lucide-react';
import { copyText } from '../../lib/platform/browser-compat.js';
import { useT } from '../../ui/useT.js';
import { useSettings } from './context.js';
import { entryOf, type EntryId } from './entries.js';
import { highlight } from './search.js';

const RowIds = createContext({ label: '', desc: '', name: '', locked: false });

function Marked({ text }: { text: string }) {
  const { query } = useSettings();
  return (
    <>
      {highlight(text, query).map((piece, i) =>
        piece.hit ? <mark key={i}>{piece.text}</mark> : piece.text,
      )}
    </>
  );
}

export function Row({
  id,
  control,
  status,
  lock,
  children,
}: {
  id: EntryId;
  control?: ReactNode;
  status?: ReactNode;
  lock?: string;
  children?: ReactNode;
}) {
  const t = useT();
  const { matches } = useSettings();
  const uid = useId();
  if (matches && !matches.has(id)) return null;
  const entry = entryOf(id);
  return (
    <RowIds.Provider
      value={{ label: `${uid}-l`, desc: `${uid}-d`, name: t(entry.label), locked: !!lock }}
    >
      <div className="srow" id={`row-${id}`}>
        <div className="srow-text">
          <h3 id={`${uid}-l`}>
            <Marked text={t(entry.label)} />
          </h3>
          <p id={`${uid}-d`}>
            <Marked text={t(entry.desc)} />
          </p>
        </div>
        {control && <div className="srow-control">{control}</div>}
        {(status || lock) && (
          <div className="srow-status">
            {lock && <StatusChip tone="lock">{lock}</StatusChip>}
            {status}
          </div>
        )}
        {children && <div className="srow-extra">{children}</div>}
      </div>
    </RowIds.Provider>
  );
}

export function Block({ id, children }: { id: EntryId; children: ReactNode }) {
  const { matches } = useSettings();
  if (matches && !matches.has(id)) return null;
  return (
    <div className="sblock" id={`row-${id}`}>
      {children}
    </div>
  );
}

export function Switch({
  checked,
  onChange,
  disabled,
  name,
}: {
  checked: boolean;
  onChange: (next: boolean) => void;
  disabled?: boolean;
  name?: string;
}) {
  const ids = useContext(RowIds);
  return (
    <label className="switch u-switch">
      <input
        type="checkbox"
        role="switch"
        checked={checked}
        disabled={disabled || ids.locked}
        aria-label={name ?? ids.name}
        aria-labelledby={name ? undefined : ids.label}
        aria-describedby={name ? undefined : ids.desc}
        onChange={(e) => onChange(e.target.checked)}
      />
      <span className="switch-track" aria-hidden="true" />
    </label>
  );
}

type ChoiceProps<T extends string> = {
  value: T;
  options: readonly { value: T; label: string }[];
  onChange: (next: T) => void;
  disabled?: boolean;
};

export function Segmented<T extends string>({
  value,
  options,
  onChange,
  disabled,
}: ChoiceProps<T>) {
  const ids = useContext(RowIds);
  const group = useRef<HTMLDivElement>(null);
  const move = (from: number, step: number) => {
    const next = options[(from + step + options.length) % options.length];
    if (!next) return;
    onChange(next.value);
    group.current?.querySelectorAll<HTMLElement>('[role=radio]')[options.indexOf(next)]?.focus();
  };
  return (
    <div
      ref={group}
      className="sseg u-segmented"
      role="radiogroup"
      aria-labelledby={ids.label}
      aria-describedby={ids.desc}
    >
      {options.map((option, i) => (
        <button
          key={option.value}
          type="button"
          role="radio"
          aria-checked={option.value === value}
          tabIndex={option.value === value ? 0 : -1}
          disabled={disabled || ids.locked}
          onClick={() => onChange(option.value)}
          onKeyDown={(e) => {
            const step = { ArrowRight: 1, ArrowDown: 1, ArrowLeft: -1, ArrowUp: -1 }[e.key];
            if (!step) return;
            e.preventDefault();
            move(i, step);
          }}
        >
          {option.label}
        </button>
      ))}
    </div>
  );
}

export function SelectBox<T extends string>({
  value,
  options,
  onChange,
  disabled,
}: ChoiceProps<T>) {
  const ids = useContext(RowIds);
  return (
    <select
      value={value}
      disabled={disabled || ids.locked}
      aria-labelledby={ids.label}
      aria-describedby={ids.desc}
      onChange={(e) => onChange(e.target.value as T)}
    >
      {options.map((option) => (
        <option key={option.value} value={option.value}>
          {option.label}
        </option>
      ))}
    </select>
  );
}

const CHIP_ICONS = { ok: Check, warn: TriangleAlert, off: Minus, info: Info, lock: Lock } as const;

/** A state in a word and a mark, never in colour alone. */
export function StatusChip({
  tone,
  children,
}: {
  tone: keyof typeof CHIP_ICONS;
  children: ReactNode;
}) {
  const Icon = CHIP_ICONS[tone];
  return (
    <span className={`schip schip-${tone}`}>
      <Icon size={12} aria-hidden="true" />
      {children}
    </span>
  );
}

export function CopyCommand({ command, caption }: { command: string; caption?: string }) {
  const t = useT();
  const [state, setState] = useState<'idle' | 'copied' | 'failed'>('idle');
  useEffect(() => {
    if (state === 'idle') return;
    const timer = setTimeout(() => setState('idle'), 1800);
    return () => clearTimeout(timer);
  }, [state]);
  return (
    <div className="copycmd">
      {caption && <span className="copycmd-caption">{caption}</span>}
      <code tabIndex={0}>{command}</code>
      <button
        type="button"
        className="icon-button"
        aria-label={`${t('stCopy')}: ${command}`}
        onClick={async () => setState((await copyText(command)) ? 'copied' : 'failed')}
      >
        {state === 'copied' ? <Check size={16} /> : <Copy size={16} />}
      </button>
      <span className="visually-hidden" role="status">
        {state === 'copied' ? t('stCopied') : state === 'failed' ? t('stCopyFailed') : ''}
      </span>
    </div>
  );
}

export function InlineHelp({ summary, children }: { summary: string; children: ReactNode }) {
  return (
    <details className="shelp">
      <summary>{summary}</summary>
      <div>{children}</div>
    </details>
  );
}

export function DangerZone({ children }: { children: ReactNode }) {
  const t = useT();
  const id = useId();
  return (
    <section className="sdanger" aria-labelledby={id}>
      <h3 id={id}>{t('stDanger')}</h3>
      {children}
    </section>
  );
}

export function Skeleton() {
  const t = useT();
  return (
    <div className="sskel" role="status" aria-label={t('loading')}>
      <span />
      <span />
    </div>
  );
}

export function ErrorLine({ message, onRetry }: { message: string; onRetry?: () => void }) {
  const t = useT();
  return (
    <p className="serror" role="alert">
      {message}
      {onRetry && (
        <button type="button" className="text-button" onClick={onRetry}>
          {t('retry')}
        </button>
      )}
    </p>
  );
}
