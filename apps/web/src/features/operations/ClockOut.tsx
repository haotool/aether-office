import { useMemo, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { useQueryClient } from '@tanstack/react-query';
import { DoorOpen } from 'lucide-react';
import type { AttributedSession, ClockOutItem } from '@aether/contracts';
import { formatSpan } from '@aether/kernel';
import { sessionLink } from '../../lib/sessions/session-names.js';
import { Modal } from '../../ui/Modal.js';
import { useT, useWhy } from '../../ui/useT.js';
import {
  IDLE_DAYS,
  clockOut,
  formatMemory,
  idleMs,
  idleSessions,
  memoryOf,
  useLeaving,
  type IdleDays,
} from './clock-out.js';

type Step = 'pick' | 'confirm' | 'busy' | 'done';
type Locale = 'zh-TW' | 'en';
type Flow = ReturnType<typeof useClockOutFlow>;
const nameOf = (s: AttributedSession) => s.title ?? s.repo;

function usePicking(sessions: readonly AttributedSession[]) {
  const [days, setDays] = useState<IdleDays>(1);
  const idle = useMemo(() => idleSessions(sessions, days), [sessions, days]);
  const [picked, setPicked] = useState<ReadonlySet<string>>(() => new Set(idle.map((s) => s.key)));
  const chosen = idle.filter((s) => picked.has(s.key));
  const choose = (keys: Iterable<string>) => setPicked(new Set(keys));
  const toggle = (key: string) =>
    choose(picked.has(key) ? [...picked].filter((k) => k !== key) : [...picked, key]);
  const changeDays = (next: IdleDays) => {
    setDays(next);
    choose(idleSessions(sessions, next).map((s) => s.key));
  };
  return { days, idle, picked, chosen, choose, toggle, changeDays };
}

function useClockOutFlow(all: readonly AttributedSession[], only: readonly string[] | undefined) {
  const client = useQueryClient();
  const send = useLeaving((s) => s.send);
  const sessions = useMemo(
    () => (only ? all.filter((s) => only.includes(s.key)) : all),
    [all, only],
  );
  const picking = usePicking(sessions);
  const { chosen, days } = picking;
  const [step, setStep] = useState<Step>('pick');
  const [asked, setAsked] = useState<AttributedSession[]>([]);
  const [results, setResults] = useState<ClockOutItem[]>([]);
  const [error, setError] = useState('');
  const go = async () => {
    setStep('busy');
    setError('');
    try {
      const { results: done } = await clockOut(chosen, days);
      setAsked(chosen);
      setResults(done);
      send(done.filter((r) => r.outcome === 'cleared').map((r) => r.key));
      setStep('done');
      await client.invalidateQueries({ queryKey: ['local-sessions'] });
    } catch (e) {
      setError(e instanceof Error ? e.message : 'REQUEST_FAILED');
      setStep('confirm');
    }
  };
  return { ...picking, step, setStep, asked, results, error, go };
}

type Results = Flow['results'];

function ClearedSummary({
  results,
  cleared,
  freed,
}: {
  results: Results;
  cleared: number;
  freed: number;
}) {
  const t = useT();
  return (
    <p role="status" className="clock-out-summary">
      <b>
        {cleared} {t('clockOutLeft')}
      </b>
      {results.length > cleared && (
        <>
          {' · '}
          {results.length - cleared} {t('clockOutStayed')}
        </>
      )}
      {freed > 0 && (
        <>
          {' · '}
          {t('clockOutFreed')} {formatMemory(freed)}
        </>
      )}
    </p>
  );
}

function ClockOutResults({ results, names }: { results: Results; names: Map<string, string> }) {
  const t = useT();
  return (
    <ul className="clock-out-list">
      {results.map((r) => (
        <li key={r.key} className={`clock-out-row ${r.outcome}`}>
          <span className="clock-out-main">
            <strong>{names.get(r.key) ?? r.key}</strong>
            <small>
              {r.outcome === 'cleared' ? t('clockOutOk') : t(`clockOutReason_${r.reason}`)}
            </small>
          </span>
        </li>
      ))}
    </ul>
  );
}

function DonePanel({ flow, onClose }: { flow: Flow; onClose: () => void }) {
  const t = useT();
  const navigate = useNavigate();
  const { results, asked } = flow;
  const cleared = results.filter((r) => r.outcome === 'cleared');
  const freed = cleared.reduce(
    (sum, r) => sum + (r.outcome === 'cleared' ? (r.freedBytes ?? 0) : 0),
    0,
  );
  const names = new Map(asked.map((s) => [s.key, nameOf(s)]));
  const first = asked.find((s) => s.key === cleared[0]?.key);
  return (
    <div className="clock-out">
      <ClearedSummary results={results} freed={freed} cleared={cleared.length} />
      <ClockOutResults results={results} names={names} />
      <div className="button-row">
        {first && (
          <button
            className="primary"
            onClick={() => {
              onClose();
              navigate(sessionLink(first));
            }}
          >
            {t('clockOutWatch')}
          </button>
        )}
        <button className="secondary" onClick={onClose}>
          {t('close')}
        </button>
      </div>
    </div>
  );
}

function PickTools({
  idle,
  picked,
  choose,
}: {
  idle: Flow['idle'];
  picked: Flow['picked'];
  choose: Flow['choose'];
}) {
  const t = useT();
  return (
    <div className="clock-out-tools">
      <button className="secondary" onClick={() => choose(idle.map((s) => s.key))}>
        {t('clockOutSelectAll')}
      </button>
      <button className="secondary" onClick={() => choose([])}>
        {t('clockOutClear')}
      </button>
      <button
        className="secondary"
        onClick={() => choose(idle.filter((s) => !picked.has(s.key)).map((s) => s.key))}
      >
        {t('clockOutInvert')}
      </button>
    </div>
  );
}

function PickCount({
  chosen,
  total,
  memory,
}: {
  chosen: number;
  total: number;
  memory: ReturnType<typeof memoryOf>;
}) {
  const t = useT();
  return (
    <p className="clock-out-count" aria-live="polite">
      {t('clockOutSelected')} {chosen} / {total}
      {memory.known > 0 && (
        <>
          {' · '}
          {t('clockOutMemory')} {formatMemory(memory.bytes)}
          {memory.known < chosen && (
            <small>
              {' '}
              ({t('clockOutMemoryPartial')} {memory.known})
            </small>
          )}
        </>
      )}
    </p>
  );
}

function PickList({ flow, locale }: { flow: Flow; locale: Locale }) {
  const t = useT();
  const { idle, picked, chosen, choose, toggle } = flow;
  const memory = memoryOf(chosen);
  return (
    <>
      <PickTools idle={idle} picked={picked} choose={choose} />
      <ul className="clock-out-list">
        {idle.map((s) => (
          <li key={s.key}>
            <label className="clock-out-row">
              <input type="checkbox" checked={picked.has(s.key)} onChange={() => toggle(s.key)} />
              <span className="clock-out-main">
                <strong>{nameOf(s)}</strong>
                <small>
                  {s.repo} · {t('quietFor')} {formatSpan(s.liveness.quietMs ?? 0, locale)}
                  {s.resources && ` · ${formatMemory(s.resources.rssBytes)}`}
                </small>
              </span>
            </label>
          </li>
        ))}
      </ul>
      <PickCount chosen={chosen.length} total={idle.length} memory={memory} />
    </>
  );
}

function PickPanel({ flow, locale }: { flow: Flow; locale: Locale }) {
  const t = useT();
  const whyNot = useWhy();
  const { days, idle, chosen, changeDays, setStep } = flow;
  return (
    <div className="clock-out">
      <label className="clock-out-threshold">
        {t('clockOutIdle')}
        <select value={days} onChange={(e) => changeDays(Number(e.target.value) as IdleDays)}>
          {IDLE_DAYS.map((d) => (
            <option key={d} value={d}>
              {formatSpan(idleMs(d), locale)}
            </option>
          ))}
        </select>
      </label>
      {idle.length === 0 ? (
        <p className="clock-out-empty">{t('clockOutNone')}</p>
      ) : (
        <PickList flow={flow} locale={locale} />
      )}
      <div className="button-row">
        <button
          className="primary clock-out-go"
          disabled={chosen.length === 0}
          {...whyNot([chosen.length > 0, 'whyPickSession'])}
          onClick={() => setStep('confirm')}
        >
          <DoorOpen size={18} aria-hidden="true" />
          {t('clockOut')}
          {chosen.length > 0 && ` (${chosen.length})`}
        </button>
      </div>
    </div>
  );
}

function ConfirmPanel({ flow, locale }: { flow: Flow; locale: Locale }) {
  const t = useT();
  const whyNot = useWhy();
  const { chosen, error, step, setStep, go } = flow;
  return (
    <div className="clock-out">
      <p>
        <b>{t('clockOutConfirm')}</b>
      </p>
      <ul className="clock-out-list">
        {chosen.map((s) => (
          <li key={s.key} className="clock-out-row">
            <span className="clock-out-main">
              <strong>{nameOf(s)}</strong>
              <small>
                {t('quietFor')} {formatSpan(s.liveness.quietMs ?? 0, locale)}
              </small>
            </span>
          </li>
        ))}
      </ul>
      <p>{t('clockOutExplain')}</p>
      {error && (
        <p role="alert" className="error">
          {error}
        </p>
      )}
      <div className="button-row">
        <button
          className="primary clock-out-go"
          disabled={step === 'busy'}
          {...whyNot([step !== 'busy', 'whyBusy'])}
          onClick={() => void go()}
        >
          <DoorOpen size={18} aria-hidden="true" />
          {step === 'busy' ? t('clockOutBusy') : t('clockOutGo')}
        </button>
        <button
          className="secondary"
          disabled={step === 'busy'}
          {...whyNot([step !== 'busy', 'whyBusy'])}
          onClick={() => setStep('pick')}
        >
          {t('clockOutBack')}
        </button>
      </div>
    </div>
  );
}

export function ClockOut({
  sessions,
  only,
  locale,
  onClose,
}: {
  sessions: readonly AttributedSession[];
  only?: readonly string[];
  locale: Locale;
  onClose: () => void;
}) {
  const t = useT();
  const flow = useClockOutFlow(sessions, only);
  return (
    <Modal title={t('clockOutTitle')} onClose={onClose}>
      {flow.step === 'done' ? (
        <DonePanel flow={flow} onClose={onClose} />
      ) : flow.step === 'pick' ? (
        <PickPanel flow={flow} locale={locale} />
      ) : (
        <ConfirmPanel flow={flow} locale={locale} />
      )}
    </Modal>
  );
}
