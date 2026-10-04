import { useEffect, useState } from 'react';
import type { LocalSession } from '@aether/contracts';
import { useT } from '../ui.js';

const TIME_ZONE = 'Asia/Taipei';
const format = (now: Date) =>
  new Intl.DateTimeFormat('en-GB', {
    hour: '2-digit',
    minute: '2-digit',
    hour12: false,
    timeZone: TIME_ZONE,
  }).format(now);
const pad = (n: number) => String(n).padStart(3, '0');

/** Readout in the top bar: how many local agent sessions exist, how many have a live process, and the time in Taipei. */
export function Telemetry({ sessions }: { sessions: readonly LocalSession[] }) {
  const t = useT();
  const [now, setNow] = useState(() => new Date());
  useEffect(() => {
    const timer = setInterval(() => setNow(new Date()), 15000);
    return () => clearInterval(timer);
  }, []);
  const live = sessions.filter((s) => s.process === 'running').length;
  return (
    <dl className="telemetry" aria-label={t('telemetry')}>
      <div>
        <dt>{t('sessions')}</dt>
        <dd>{pad(sessions.length)}</dd>
      </div>
      <div>
        <dt>{t('liveProcesses')}</dt>
        <dd>{pad(live)}</dd>
      </div>
      <div>
        <dt>TPE</dt>
        <dd>{format(now)}</dd>
      </div>
    </dl>
  );
}
