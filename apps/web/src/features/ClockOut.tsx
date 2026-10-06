import { useMemo, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { useQueryClient } from '@tanstack/react-query';
import { DoorOpen } from 'lucide-react';
import type { AttributedSession, ClockOutItem } from '@aether/contracts';
import { formatSpan } from '../localSessions.js';
import { Modal, useT } from '../ui.js';
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
const nameOf = (s: AttributedSession) => s.title ?? s.repo;

/**
 * "Clock out": the running sessions that have been idle for a day or more, picked all at once or one by one and sent
 * home together. Pick, confirm (what will happen), then each session's own result; the ones that went are shown
 * leaving the office. The server re-checks every session (see services/clock-out.ts).
 */
export function ClockOut({
  sessions,
  locale,
  onClose,
}: {
  sessions: readonly AttributedSession[];
  locale: 'zh-TW' | 'en';
  onClose: () => void;
}) {
  const t = useT();
  const client = useQueryClient();
  const navigate = useNavigate();
  const send = useLeaving((s) => s.send);
  const [days, setDays] = useState<IdleDays>(1);
  const idle = useMemo(() => idleSessions(sessions, days), [sessions, days]);
  const [picked, setPicked] = useState<ReadonlySet<string>>(() => new Set(idle.map((s) => s.key)));
  const [step, setStep] = useState<Step>('pick');
  const [asked, setAsked] = useState<AttributedSession[]>([]);
  const [results, setResults] = useState<ClockOutItem[]>([]);
  const [error, setError] = useState('');
  const chosen = idle.filter((s) => picked.has(s.key));
  const memory = memoryOf(chosen);
  const choose = (keys: Iterable<string>) => setPicked(new Set(keys));
  const toggle = (key: string) =>
    choose(picked.has(key) ? [...picked].filter((k) => k !== key) : [...picked, key]);
  const changeDays = (next: IdleDays) => {
    setDays(next);
    choose(idleSessions(sessions, next).map((s) => s.key)); // a new threshold starts from "everyone who is idle that long"
  };
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
  const cleared = results.filter((r) => r.outcome === 'cleared');
  const freed = cleared.reduce(
    (sum, r) => sum + (r.outcome === 'cleared' ? (r.freedBytes ?? 0) : 0),
    0,
  );
  const names = new Map(asked.map((s) => [s.key, nameOf(s)]));
  const first = asked.find((s) => s.key === cleared[0]?.key);
  const span = (s: AttributedSession) => formatSpan(s.liveness.quietMs ?? 0, locale);

  return (
    <Modal title={t('clockOutTitle')} onClose={onClose}>
      {step === 'done' ? (
        <div className="clock-out">
          <p role="status" className="clock-out-summary">
            <b>
              {cleared.length} {t('clockOutLeft')}
            </b>
            {results.length > cleared.length && (
              <>
                {' · '}
                {results.length - cleared.length} {t('clockOutStayed')}
              </>
            )}
            {freed > 0 && (
              <>
                {' · '}
                {t('clockOutFreed')} {formatMemory(freed)}
              </>
            )}
          </p>
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
          <div className="button-row">
            {first && (
              <button
                className="primary"
                onClick={() => {
                  onClose();
                  navigate(
                    `/office?${first.projectId ? `project=${first.projectId}&` : ''}agent=${encodeURIComponent(`local:${first.key}`)}&focus=1`,
                  );
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
      ) : step === 'pick' ? (
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
            <>
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
              <ul className="clock-out-list">
                {idle.map((s) => (
                  <li key={s.key}>
                    <label className="clock-out-row">
                      <input
                        type="checkbox"
                        checked={picked.has(s.key)}
                        onChange={() => toggle(s.key)}
                      />
                      <span className="clock-out-main">
                        <strong>{nameOf(s)}</strong>
                        <small>
                          {s.repo} · {t('quietFor')} {span(s)}
                          {s.resources && ` · ${formatMemory(s.resources.rssBytes)}`}
                        </small>
                      </span>
                    </label>
                  </li>
                ))}
              </ul>
              <p className="clock-out-count" aria-live="polite">
                {t('clockOutSelected')} {chosen.length} / {idle.length}
                {memory.known > 0 && (
                  <>
                    {' · '}
                    {t('clockOutMemory')} {formatMemory(memory.bytes)}
                    {memory.known < chosen.length && (
                      <small>
                        {' '}
                        ({t('clockOutMemoryPartial')} {memory.known})
                      </small>
                    )}
                  </>
                )}
              </p>
            </>
          )}
          <div className="button-row">
            <button
              className="primary clock-out-go"
              disabled={chosen.length === 0}
              onClick={() => setStep('confirm')}
            >
              <DoorOpen size={18} aria-hidden="true" />
              {t('clockOut')}
              {chosen.length > 0 && ` (${chosen.length})`}
            </button>
          </div>
        </div>
      ) : (
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
                    {t('quietFor')} {span(s)}
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
              onClick={() => void go()}
            >
              <DoorOpen size={18} aria-hidden="true" />
              {step === 'busy' ? t('clockOutBusy') : t('clockOutGo')}
            </button>
            <button
              className="secondary"
              disabled={step === 'busy'}
              onClick={() => setStep('pick')}
            >
              {t('clockOutBack')}
            </button>
          </div>
        </div>
      )}
    </Modal>
  );
}
