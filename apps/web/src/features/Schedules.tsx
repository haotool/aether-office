import { useQuery } from '@tanstack/react-query';
import type { Schedule } from '@aether/contracts';
import { api, execute } from '../api.js';
import type { Key } from '../i18n.js';
import { usePreferences } from '../state.js';
import { Field, useT } from '../ui.js';
import { EnableToggle, useCommandRunner } from './panel-kit.js';

/** Short weekday names (Sunday first, as the schedule numbers them) in the person's language. */
function weekdays(locale: string): string[] {
  const format = new Intl.DateTimeFormat(locale, { weekday: 'short', timeZone: 'UTC' });
  return Array.from({ length: 7 }, (_, day) => format.format(new Date(Date.UTC(2023, 0, 1 + day)))); // 2023-01-01 is a Sunday
}

function describe(s: Schedule, t: (key: Key) => string, days: string[]): string {
  if (s.spec.kind === 'once') return new Date(s.spec.at).toISOString();
  if (s.spec.kind === 'daily') return `${t('scheduleDaily')} ${s.spec.time}`;
  return `${t('scheduleWeekly')} ${s.spec.days.map((d) => days[d]).join(' ')} ${s.spec.time}`;
}

type Run = (fn: () => Promise<unknown>) => Promise<void>;

function CreateScheduleForm({
  projectId,
  days,
  error,
  run,
}: {
  projectId: string;
  days: string[];
  error: string;
  run: Run;
}) {
  const t = useT();
  return (
    <form
      onSubmit={(e) => {
        e.preventDefault();
        const form = new FormData(e.currentTarget);
        const picked = form.getAll('day').map(Number);
        const time = String(form.get('time'));
        const spec = picked.length
          ? { kind: 'weekly', days: picked, time }
          : { kind: 'daily', time };
        void run(() =>
          execute(
            'schedule.create',
            {
              name: form.get('name'),
              spec,
              timezone: form.get('timezone'),
              missed: form.get('missed'),
              template: {
                title: form.get('title'),
                description: '',
                acceptance: form.get('acceptance'),
              },
            },
            projectId,
          ),
        );
      }}
    >
      <Field label={t('scheduleName')}>
        <input name="name" required maxLength={160} />
      </Field>
      <Field label={t('scheduleTime')}>
        <input name="time" type="time" required defaultValue="09:00" />
      </Field>
      <fieldset>
        <legend>{t('scheduleDays')}</legend>
        {days.map((d, i) => (
          <label key={d}>
            <input type="checkbox" name="day" value={i} /> {d}
          </label>
        ))}
      </fieldset>
      <Field label={t('scheduleTimezone')}>
        <input name="timezone" required defaultValue="Asia/Taipei" />
      </Field>
      <Field label={t('scheduleMissed')}>
        <select name="missed" defaultValue="skip">
          <option value="skip">{t('scheduleSkip')}</option>
          <option value="single">{t('scheduleSingle')}</option>
        </select>
      </Field>
      <Field label={t('scheduleTitle')}>
        <input name="title" required maxLength={160} />
      </Field>
      <Field label={t('scheduleAcceptance')}>
        <textarea name="acceptance" required maxLength={8000} rows={2} />
      </Field>
      {error && <p role="alert">{error}</p>}
      <button type="submit">{t('scheduleCreate')}</button>
    </form>
  );
}

function ScheduleRow({
  schedule: s,
  days,
  canManage,
  onToggle,
}: {
  schedule: Schedule;
  days: string[];
  canManage: boolean;
  onToggle: () => void;
}) {
  const t = useT();
  return (
    <li className="panel">
      <strong>{s.name}</strong> · {describe(s, t, days)} · {s.timezone}
      <br />
      <small>
        {t('scheduleNext')}:{' '}
        {s.nextRunAt && s.enabled
          ? new Date(s.nextRunAt).toLocaleString('zh-TW', { timeZone: s.timezone })
          : t('unavailable')}
      </small>{' '}
      <EnableToggle enabled={s.enabled} canManage={canManage} onToggle={onToggle} />
    </li>
  );
}

export function Schedules({ projectId, canManage }: { projectId: string; canManage: boolean }) {
  const t = useT();
  const days = weekdays(usePreferences((s) => s.locale));
  const key = ['schedules', projectId];
  const { error, run } = useCommandRunner([key], false);
  const query = useQuery({
    queryKey: key,
    queryFn: () => api<{ schedules: Schedule[] }>(`/api/projects/${projectId}/schedules`),
    refetchInterval: 5000,
  });
  return (
    <section aria-labelledby="schedules-title">
      <h3 id="schedules-title">{t('schedules')}</h3>
      <p className="muted">{t('schedulesNote')}</p>
      {query.data?.schedules.length === 0 && <p>{t('schedulesEmpty')}</p>}
      <ul className="plain-list">
        {query.data?.schedules.map((s) => (
          <ScheduleRow
            key={s.id}
            schedule={s}
            days={days}
            canManage={canManage}
            onToggle={() =>
              void run(() =>
                execute(
                  'schedule.toggle',
                  { scheduleId: s.id, enabled: !s.enabled },
                  projectId,
                  s.version,
                ),
              )
            }
          />
        ))}
      </ul>
      {canManage && (
        <CreateScheduleForm projectId={projectId} days={days} error={error} run={run} />
      )}
    </section>
  );
}
