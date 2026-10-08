import { TERMINAL_KEYS } from './terminal-keys.js';
import { useT, useLocale } from '../ui/useT.js';

/** Esc, Tab, Ctrl+C and the arrows for a touch screen. Shown only to a finger (see styles/phone-drawer.css). */
export function TerminalKeys({ onKey }: { onKey: (sequence: string) => void }) {
  const t = useT();
  const zh = useLocale() === 'zh-TW';
  return (
    <div className="terminal-keys" role="toolbar" aria-label={t('terminalKeys')}>
      {TERMINAL_KEYS.map((key) => (
        <button
          key={key.label}
          type="button"
          aria-label={zh ? key.label_zh : key.label}
          // Keep the focus where it is, or the on-screen keyboard closes on every tap.
          onPointerDown={(e) => e.preventDefault()}
          onClick={() => onKey(key.send)}
        >
          {key.label}
        </button>
      ))}
    </div>
  );
}
