import { useState } from 'react';
import type { Agent } from '@aether/contracts';
import { DEPARTMENTS } from '@aether/kernel';
import type { PulseKind, Shot } from './director.js';
import { FLOORS } from './layout.js';

const PIPS = 8;
const pad = (n: number) => String(n).padStart(3, '0');

export type FloorCount = { total: number; working: number };

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

/** What the camera is on, in one short line: who, and what they are doing or to whom they are talking. */
export function ShotCaption({
  zh,
  shot,
  agents,
  doing,
  attention,
}: {
  zh: boolean;
  shot: Shot;
  agents: readonly Agent[];
  doing: Readonly<Record<string, string>> | undefined;
  attention?: Readonly<Record<string, string>> | undefined;
}) {
  const name = (id: string | undefined) => agents.find((a) => a.id === id)?.name ?? '';
  const [first, second] = shot.subjects;
  const text =
    shot.kind === 'pair'
      ? `${name(first)} → ${name(second)} · ${(zh ? KIND_ZH : KIND_EN)[shot.pulse?.kind ?? 'inform']}`
      : shot.kind === 'closeup'
        ? [
            name(first),
            (shot.reason === 'attention' ? attention?.[first ?? ''] : undefined) ??
              doing?.[first ?? ''] ??
              (shot.reason === 'message'
                ? zh
                  ? '傳出訊息'
                  : 'sent a message'
                : (zh ? REASON_ZH : REASON_EN)[shot.reason]),
          ]
            .filter(Boolean)
            .join(' · ')
        : `${shot.floor + 1}F · ${zh ? DEPARTMENTS[shot.floor]?.zh : DEPARTMENTS[shot.floor]?.en}`;
  return (
    <div className="shot-caption" role="status" data-kind={shot.kind}>
      <i aria-hidden="true" />
      <span>{text}</span>
    </div>
  );
}

/** Which floor is shown (or the whole building), with its head count and how many are working. */
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
  const department = DEPARTMENTS[floor]!;
  const members = exploded ? perFloor.reduce((n, f) => n + f.total, 0) : perFloor[floor]!.total;
  const working = exploded ? perFloor.reduce((n, f) => n + f.working, 0) : perFloor[floor]!.working;
  return (
    <div className="floor-hud fui" style={{ ['--accent' as string]: department.accent }}>
      <small>
        {exploded
          ? zh
            ? '全棟總覽'
            : 'BUILDING OVERVIEW'
          : `${zh ? '樓層' : 'FLOOR'} ${String(floor + 1).padStart(2, '0')} / ${String(FLOORS).padStart(2, '0')}`}
      </small>
      <b>{exploded ? (zh ? '分層展開' : 'Exploded view') : zh ? department.zh : department.en}</b>
      <div className="readouts">
        <span>
          {zh ? '成員' : 'MEM'} <i>{pad(members)}</i>
        </span>
        <span>
          {zh ? '進行中' : 'ACT'} <i>{pad(working)}</i>
        </span>
      </div>
    </div>
  );
}

// What the person chose last time; failing that, open on a screen with room for it and closed on a phone, where it
// would cover the scene.
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

/** The floor switcher: one slab per department, the exploded view, the tour and the key help. */
export function BuildingPanel({
  zh,
  floor,
  exploded,
  follow,
  perFloor,
  onFloor,
  onExplode,
  onFollow,
}: {
  zh: boolean;
  floor: number;
  exploded: boolean;
  follow: boolean;
  perFloor: readonly FloorCount[];
  onFloor: (floor: number) => void;
  onExplode: () => void;
  onFollow: () => void;
}) {
  const [open, setOpen] = useState(rememberedOpen);
  const [helpOpen, setHelpOpen] = useState(false);
  const toggle = () =>
    setOpen((was) => {
      try {
        localStorage.setItem('aether-building-panel', was ? 'closed' : 'open');
      } catch {
        /* a private window: the choice just is not remembered */
      }
      return !was;
    });
  return (
    <nav
      className={`building-panel fui ${open ? '' : 'collapsed'}`}
      aria-label={zh ? '樓層' : 'Floors'}
    >
      <div className="building-head">
        <span>{zh ? '樓層' : 'DECKS'}</span>
        <button aria-expanded={open} onClick={toggle}>
          {open ? (zh ? '收合' : 'HIDE') : zh ? '展開' : 'SHOW'}
        </button>
      </div>
      {open && (
        <>
          <ol>
            {[...DEPARTMENTS].reverse().map((d) => {
              const entry = perFloor[d.floor]!;
              const lit = entry.total
                ? Math.max(entry.working ? 1 : 0, Math.round((entry.working / entry.total) * PIPS))
                : 0;
              return (
                <li key={d.id}>
                  <button
                    className={`slab ${d.floor === floor && !exploded ? 'current' : ''}`}
                    aria-current={d.floor === floor ? 'true' : undefined}
                    onClick={() => onFloor(d.floor)}
                    style={{ ['--accent' as string]: d.accent }}
                  >
                    <b>{d.floor + 1}F</b>
                    <span>{zh ? d.zh : d.en}</span>
                    <i title={zh ? '成員 · 進行中' : 'members · active'}>{pad(entry.total)}</i>
                    <em className="pips" aria-hidden="true">
                      {Array.from({ length: PIPS }, (_, n) => (
                        <u key={n} className={n < lit ? 'on' : ''} />
                      ))}
                    </em>
                  </button>
                </li>
              );
            })}
          </ol>
          <div className="building-tools">
            <button aria-pressed={exploded} onClick={onExplode}>
              {zh ? '分層展開' : 'EXPLODE'}
            </button>
            <button aria-pressed={follow} onClick={onFollow}>
              {zh ? '自動' : 'AUTO'}
            </button>
            <button aria-expanded={helpOpen} onClick={() => setHelpOpen((v) => !v)}>
              {zh ? '操作' : 'KEYS'}
            </button>
          </div>
          {helpOpen && <KeysHelp zh={zh} />}
        </>
      )}
    </nav>
  );
}

function KeysHelp({ zh }: { zh: boolean }) {
  return (
    <dl className="keys-help">
      <dt>WASD / ←↑↓→</dt>
      <dd>{zh ? '平移（Shift 加速）' : 'Pan (Shift = faster)'}</dd>
      <dt>Q / E</dt>
      <dd>{zh ? '旋轉視角' : 'Rotate'}</dd>
      <dt>+ / − · {zh ? '滾輪' : 'wheel'}</dt>
      <dd>{zh ? '縮放' : 'Zoom'}</dd>
      <dt>1–5 · [ ]</dt>
      <dd>{zh ? '切換樓層' : 'Change floor'}</dd>
      <dt>F</dt>
      <dd>{zh ? '近景追蹤活躍成員' : 'Track active members'}</dd>
      <dt>X</dt>
      <dd>{zh ? '分層展開' : 'Exploded view'}</dd>
      <dt>{zh ? '雙擊角色' : 'Double-click'}</dt>
      <dd>{zh ? '飛到座位' : 'Fly to desk'}</dd>
    </dl>
  );
}
