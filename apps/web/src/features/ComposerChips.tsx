import { useState } from 'react';
import { ChevronDown } from 'lucide-react';
import type { AttributedSession } from '@aether/contracts';
import { useT } from '../ui.js';
import { effortCommand, modelCommand, QUICK_REPLIES } from './composer-model.js';
import { ModelPicker, type ModelChoice } from './ModelPicker.js';
import { useModels } from './useModels.js';

/** The model chip: what the session runs now, and a list to change it for the next message. */
export function ModelChip({
  session,
  onCommand,
}: {
  session: AttributedSession;
  onCommand: (text: string) => void;
}) {
  const t = useT();
  const [open, setOpen] = useState(false);
  const { catalogs, refresh } = useModels();
  const provider = session.provider;
  const mine = catalogs?.filter((c) => c.provider === provider) ?? [];
  const current = session.usage.model;
  const known = mine[0]?.models.find((m) => m.id === current);
  const value: ModelChoice | undefined = known ? { provider, id: known.id } : undefined;
  const choose = (choice: ModelChoice) => {
    // A different model sends the CLI's own model command; the same model with another effort sends /effort.
    const text =
      choice.id !== value?.id
        ? modelCommand(provider, choice.id)
        : choice.effort
          ? effortCommand(provider, choice.effort)
          : null;
    if (text) onCommand(text);
    setOpen(false);
  };
  return (
    <div className="composer-model">
      <button
        type="button"
        className="model-chip u-chip"
        aria-expanded={open}
        onClick={() => setOpen(!open)}
      >
        <span className="model-chip-label">{current ?? t('composerModel')}</span>
        <ChevronDown size={14} aria-hidden />
      </button>
      {open && (
        <div className="composer-popover">
          <ModelPicker
            catalogs={mine}
            value={value}
            onChange={choose}
            onRefresh={refresh}
            efforts={provider === 'claude'}
          />
          <p className="muted">{t('composerModelNote')}</p>
          <p className="muted">
            {t(provider === 'codex' ? 'composerCodexPicker' : 'composerEffortNote')}
          </p>
        </div>
      )}
    </div>
  );
}

const QUICK_LABEL = {
  continue: 'composerContinue',
  yes: 'composerYes',
  no: 'composerNo',
  esc: 'composerEsc',
} as const;

/** One-tap replies for a phone: words that answer most prompts, and Esc, which backs out of one. */
export function QuickReplies({
  onReply,
  onEsc,
}: {
  onReply: (text: string) => void;
  onEsc: () => void;
}) {
  const t = useT();
  return (
    <div className="composer-quick" role="toolbar" aria-label={t('composerQuick')}>
      {QUICK_REPLIES.map((reply) => (
        <button
          key={reply.id}
          type="button"
          className="u-chip"
          // Keep the focus where it is, or the on-screen keyboard closes on every tap.
          onPointerDown={(e) => e.preventDefault()}
          onClick={() => (reply.send ? onReply(reply.send) : onEsc())}
        >
          {t(QUICK_LABEL[reply.id])}
        </button>
      ))}
    </div>
  );
}
