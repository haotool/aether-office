import { TERMINAL_KEYS } from './terminal-keys.js';
import { useT, useLocale } from '../../ui/useT.js';

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
          onPointerDown={(e) => e.preventDefault()}
          onClick={() => onKey(key.send)}
        >
          {key.label}
        </button>
      ))}
    </div>
  );
}
