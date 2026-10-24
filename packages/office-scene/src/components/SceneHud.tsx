import { useState } from 'react';
import type { Agent } from '@aether/contracts';
import { DEPARTMENTS } from '@aether/kernel';
import type { PulseKind, Shot } from '../environment/director.js';
import { FLOORS } from '../environment/layout.js';
import { SlabKpi, type FloorKpiBadge } from './FloorKpi.js';
import { departmentAt } from '../scene/scene-geometry.js';
import { sceneT, sceneText } from '../i18n/scene-text.js';

const PIPS = 8;
const pad = (n: number) => String(n).padStart(3, '0');

export type FloorCount = { total: number; working: number };
const NO_FLOOR: FloorCount = { total: 0, working: 0 };

const KIND_ZH: Record<PulseKind, string> = {
  inform: '通知',
  request: '請求',
  decision: '決策',
  handoff: '交接',
  sub: '子代理',
};
const KIND_EN: Record<PulseKind, string> = {
  inform: 'inform',
  request: 'request',
  decision: 'decision',
  handoff: 'handoff',
  sub: 'subagent',
};
const REASON_ZH: Partial<Record<Shot['reason'], string>> = {
  approval: '等待授權',
  error: '發生錯誤',
  review: '審查中',
  peer: '等待回覆',
};
const REASON_EN: Partial<Record<Shot['reason'], string>> = {
  approval: 'waiting for approval',
  error: 'error',
  review: 'reviewing',
  peer: 'waiting for a reply',
};

type CaptionFacts = {
  zh: boolean;
  agents: readonly Agent[];
  doing: Readonly<Record<string, string>> | undefined;
  attention?: Readonly<Record<string, string>> | undefined;
};

function closeupDoing(shot: Shot, id: string, { zh, doing, attention }: CaptionFacts) {
  const said = (shot.reason === 'attention' ? attention?.[id] : undefined) ?? doing?.[id];
  if (said !== undefined) return said;
  return shot.reason === 'message'
    ? sceneText(zh, 'hud.sentMessage')
    : (zh ? REASON_ZH : REASON_EN)[shot.reason];
}

function shotText(shot: Shot, facts: CaptionFacts): string {
  const { zh, agents } = facts;
  const name = (id: string | undefined) => agents.find((a) => a.id === id)?.name ?? '';
  const [first, second] = shot.subjects;
  if (shot.kind === 'pair')
    return `${name(first)} → ${name(second)} · ${(zh ? KIND_ZH : KIND_EN)[shot.pulse?.kind ?? 'inform']}`;
  if (shot.kind === 'closeup')
    return [name(first), closeupDoing(shot, first ?? '', facts)].filter(Boolean).join(' · ');
  return `${shot.floor + 1}F · ${zh ? DEPARTMENTS[shot.floor]?.zh : DEPARTMENTS[shot.floor]?.en}`;
}

export function ShotCaption({ zh, shot, agents, doing, attention }: CaptionFacts & { shot: Shot }) {
  const text = shotText(shot, { zh, agents, doing, attention });
  return (
    <div className="shot-caption" role="status" data-kind={shot.kind}>
      <i aria-hidden="true" />
      <span>{text}</span>
    </div>
  );
}

export function FloorHud({
  zh,
  exploded,
  floor,
  perFloor,
}: {
  zh: boolean;
  exploded: boolean;
  floor: number;
  perFloor: readonly FloorCount[];
}) {
  const department = departmentAt(floor);
  const here = perFloor[floor] ?? NO_FLOOR;
  const members = exploded ? perFloor.reduce((n, f) => n + f.total, 0) : here.total;
  const working = exploded ? perFloor.reduce((n, f) => n + f.working, 0) : here.working;
  const t = sceneT(zh);
  return (
    <div className="floor-hud fui" style={{ ['--accent' as string]: department.accent }}>
      <small>
        {exploded
          ? t('hud.buildingOverview')
          : `${t('hud.floorWord')} ${String(floor + 1).padStart(2, '0')} / ${String(FLOORS).padStart(2, '0')}`}
      </small>
      <b>{exploded ? t('hud.explodedView') : zh ? department.zh : department.en}</b>
      <div className="readouts">
        <span>
          {t('hud.members')} <i>{pad(members)}</i>
        </span>
        <span>
          {t('hud.active')} <i>{pad(working)}</i>
        </span>
      </div>
    </div>
  );
}

const rememberedOpen = () => {
  try {
    const saved = localStorage.getItem('aether-building-panel');
    if (saved) return saved !== 'closed';
  } catch {
    /* storage unavailable: use the default */
  }
  return !window.matchMedia('(max-width: 760px), (pointer: coarse) and (max-height: 500px)')
    .matches;
};

type BuildingPanelProps = {
  zh: boolean;
  floor: number;
  exploded: boolean;
  follow: boolean;
  perFloor: readonly FloorCount[];
  kpi?: readonly (FloorKpiBadge | null)[] | undefined;
  onFloor: (floor: number) => void;
  onExplode: () => void;
  onFollow: () => void;
};

type DeckSlabProps = {
  deck: (typeof DEPARTMENTS)[number];
  zh: boolean;
  current: boolean;
  highlighted: boolean;
  entry: FloorCount;
  badge: FloorKpiBadge | null | undefined;
  onFloor: (floor: number) => void;
};

function DeckSlab({ deck: d, zh, current, highlighted, entry, badge, onFloor }: DeckSlabProps) {
  const lit = entry.total
    ? Math.max(entry.working ? 1 : 0, Math.round((entry.working / entry.total) * PIPS))
    : 0;
  return (
    <button
      className={`slab ${highlighted ? 'current' : ''}`}
      aria-current={current ? 'true' : undefined}
      onClick={() => onFloor(d.floor)}
      style={{ ['--accent' as string]: d.accent }}
    >
      <b>{d.floor + 1}F</b>
      <span>{zh ? d.zh : d.en}</span>
      <i title={sceneText(zh, 'hud.membersActive')}>{pad(entry.total)}</i>
      <em className="pips" aria-hidden="true">
        {Array.from({ length: PIPS }, (_, n) => (
          <u key={n} className={n < lit ? 'on' : ''} />
        ))}
      </em>
      {badge && <SlabKpi badge={badge} />}
    </button>
  );
}

function DeckList({
  zh,
  floor,
  exploded,
  perFloor,
  kpi,
  onFloor,
}: Pick<BuildingPanelProps, 'zh' | 'floor' | 'exploded' | 'perFloor' | 'kpi' | 'onFloor'>) {
  return (
    <ol>
      {[...DEPARTMENTS].reverse().map((d) => (
        <li key={d.id}>
          <DeckSlab
            deck={d}
            zh={zh}
            current={d.floor === floor}
            highlighted={d.floor === floor && !exploded}
            entry={perFloor[d.floor] ?? NO_FLOOR}
            badge={kpi?.[d.floor]}
            onFloor={onFloor}
          />
        </li>
      ))}
    </ol>
  );
}

function useRememberedOpen(): [boolean, () => void] {
  const [open, setOpen] = useState(rememberedOpen);
  const toggle = () =>
    setOpen((was) => {
      try {
        localStorage.setItem('aether-building-panel', was ? 'closed' : 'open');
      } catch {
        /* a private window: the choice just is not remembered */
      }
      return !was;
    });
  return [open, toggle];
}

type PanelToolsProps = {
  zh: boolean;
  exploded: boolean;
  follow: boolean;
  helpOpen: boolean;
  onExplode: () => void;
  onFollow: () => void;
  onHelp: () => void;
};

function PanelTools({
  zh,
  exploded,
  follow,
  helpOpen,
  onExplode,
  onFollow,
  onHelp,
}: PanelToolsProps) {
  const t = sceneT(zh);
  return (
    <div className="building-tools">
      <button aria-pressed={exploded} onClick={onExplode}>
        {t('hud.explode')}
      </button>
      <button aria-pressed={follow} onClick={onFollow}>
        {t('hud.auto')}
      </button>
      <button aria-expanded={helpOpen} onClick={onHelp}>
        {t('hud.keys')}
      </button>
    </div>
  );
}

export function BuildingPanel(props: BuildingPanelProps) {
  const { zh } = props;
  const t = sceneT(zh);
  const [open, toggle] = useRememberedOpen();
  const [helpOpen, setHelpOpen] = useState(false);
  return (
    <nav className={`building-panel fui ${open ? '' : 'collapsed'}`} aria-label={t('hud.floors')}>
      <div className="building-head">
        <span>{t('hud.decks')}</span>
        <button aria-expanded={open} onClick={toggle}>
          {t(open ? 'hud.hide' : 'hud.show')}
        </button>
      </div>
      {open && (
        <>
          <DeckList {...props} />
          <PanelTools {...props} helpOpen={helpOpen} onHelp={() => setHelpOpen((v) => !v)} />
          {helpOpen && <KeysHelp zh={zh} />}
        </>
      )}
    </nav>
  );
}

function KeysHelp({ zh }: { zh: boolean }) {
  const t = sceneT(zh);
  return (
    <dl className="keys-help">
      <dt>WASD / ←↑↓→</dt>
      <dd>{t('keys.pan')}</dd>
      <dt>Q / E</dt>
      <dd>{t('keys.rotate')}</dd>
      <dt>+ / − · {t('keys.wheel')}</dt>
      <dd>{t('keys.zoom')}</dd>
      <dt>1–5 · [ ]</dt>
      <dd>{t('keys.floor')}</dd>
      <dt>F</dt>
      <dd>{t('keys.track')}</dd>
      <dt>X</dt>
      <dd>{t('hud.explodedView')}</dd>
      <dt>{t('keys.doubleClick')}</dt>
      <dd>{t('keys.flyToDesk')}</dd>
    </dl>
  );
}
