import { useId, useState, type ComponentProps, type ReactNode } from 'react';
import {
  ChevronDown,
  CircleCheck,
  CircleX,
  Info,
  Layers,
  OctagonX,
  SquareTerminal,
  Webhook,
} from 'lucide-react';
import type { Notice } from '@aether/kernel';
import type { Key } from '../i18n.js';
import { useT } from '../ui/useT.js';
import { groupNotices, noticeTone, type NoticeGroup, type Tone } from './notice-model.js';

const CONTEXT_LABELS: Record<string, Key> = {
  system: 'ctxSystem',
  environment: 'ctxEnvironment',
  ide: 'ctxIde',
  instructions: 'ctxInstructions',
  plugins: 'ctxPlugins',
  goal: 'ctxGoal',
  internal: 'ctxInternal',
  skill: 'ctxSkill',
  plugin: 'ctxPlugin',
};

const firstLine = (text: string) => text.split('\n').find((l) => l.trim()) ?? '';

type ChipProps = {
  tone: Tone;
  icon: ReactNode;
  label: ReactNode;
  gist?: string;
  mono?: boolean;
  fresh: boolean;
  children?: ReactNode;
};

/** One slim system row between messages: an icon, a label, an optional one-line gist, and details behind a toggle. */
function Chip({ tone, icon, label, gist, mono = false, fresh, children }: ChipProps) {
  const t = useT();
  const [open, setOpen] = useState(false);
  const panel = useId();
  const head = (
    <>
      <span className="notice-icon" aria-hidden>
        {icon}
      </span>
      <span className={`notice-label ${mono ? 'mono' : ''}`}>{label}</span>
      {gist && <span className={`notice-gist ${mono ? 'mono' : ''}`}>{gist}</span>}
    </>
  );
  return (
    <div className={`sys-notice ${tone} ${fresh ? 'enter' : ''}`}>
      {children ? (
        <button
          type="button"
          className="notice-head"
          aria-expanded={open}
          aria-controls={panel}
          title={open ? t('noticeHide') : t('noticeShow')}
          onClick={() => setOpen(!open)}
        >
          {head}
          <ChevronDown size={14} aria-hidden />
        </button>
      ) : (
        <div className="notice-head">{head}</div>
      )}
      {children && open && (
        <div className="notice-body" id={panel}>
          {children}
        </div>
      )}
    </div>
  );
}

function Task({ notice, fresh }: { notice: Extract<Notice, { kind: 'task' }>; fresh: boolean }) {
  const t = useT();
  const tone = noticeTone(notice);
  const label =
    tone === 'ok'
      ? t('noticeTaskDone')
      : tone === 'failed'
        ? t('noticeTaskFailed')
        : t('noticeTaskUpdate');
  const exit = notice.exitCode === null ? '' : ` · ${t('noticeExit')} ${notice.exitCode}`;
  const details = [notice.summary, notice.detail].filter(Boolean);
  return (
    <Chip
      tone={tone}
      icon={
        tone === 'ok' ? (
          <CircleCheck size={14} />
        ) : tone === 'failed' ? (
          <CircleX size={14} />
        ) : (
          <Info size={14} />
        )
      }
      label={`${label}${exit}`}
      fresh={fresh}
    >
      {details.length > 0 && (
        <>
          {details.map((text, i) => (
            <pre key={i} className="notice-text">
              {text}
            </pre>
          ))}
        </>
      )}
    </Chip>
  );
}

function Contexts({
  items,
  fresh,
}: {
  items: Extract<Notice, { kind: 'context' }>[];
  fresh: boolean;
}) {
  const t = useT();
  const count = `${items.length} ${items.length === 1 ? t('noticeItemOne') : t('noticeItemMany')}`;
  return (
    <Chip
      tone="neutral"
      icon={<Layers size={14} />}
      label={`${t('noticeContext')} · ${count}`}
      fresh={fresh}
    >
      {items.map((item, i) => (
        <section key={i} className="notice-section">
          <h5>{t(CONTEXT_LABELS[item.label] ?? 'noticeContext')}</h5>
          <pre className="notice-text">{item.text}</pre>
        </section>
      ))}
    </Chip>
  );
}

type TextGroup = Extract<NoticeGroup, { kind: 'output' | 'hook' }>;

/** A notice that is a block of text: its first line as the gist, the whole of it when opened. */
function TextNotice({
  group,
  tone,
  icon,
  label,
  fresh,
}: {
  group: TextGroup;
  tone: ComponentProps<typeof Chip>['tone'];
  icon: ReactNode;
  label: string;
  fresh: boolean;
}) {
  return (
    <Chip tone={tone} icon={icon} label={label} gist={firstLine(group.text)} fresh={fresh}>
      <pre className="notice-text">{group.text}</pre>
    </Chip>
  );
}

function One({ group, fresh }: { group: NoticeGroup; fresh: boolean }) {
  const t = useT();
  switch (group.kind) {
    case 'task':
      return <Task notice={group} fresh={fresh} />;
    case 'contexts':
      return <Contexts items={group.items} fresh={fresh} />;
    case 'command':
      return (
        <Chip
          tone="neutral"
          icon={<SquareTerminal size={14} />}
          label={group.name}
          gist={group.args}
          mono
          fresh={fresh}
        />
      );
    case 'output':
      return (
        <TextNotice
          group={group}
          tone={noticeTone(group)}
          icon={<SquareTerminal size={14} />}
          label={t('noticeOutput')}
          fresh={fresh}
        />
      );
    case 'hook':
      return (
        <TextNotice
          group={group}
          tone="neutral"
          icon={<Webhook size={14} />}
          label={t('noticeHook')}
          fresh={fresh}
        />
      );
    case 'interrupted':
      return (
        <Chip
          tone="neutral"
          icon={<OctagonX size={14} />}
          label={t('noticeInterrupted')}
          fresh={fresh}
        />
      );
  }
}

/** The notices of one place in the conversation, as chips: injected context together as one, everything else on its own. */
export function Notices({ items, fresh }: { items: readonly Notice[]; fresh: boolean }) {
  return (
    <div className="notices">
      {groupNotices(items).map((group, i) => (
        <One key={i} group={group} fresh={fresh} />
      ))}
    </div>
  );
}
