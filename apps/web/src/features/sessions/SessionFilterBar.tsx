import type { ReactNode } from 'react';
import type { AttributedSession } from '@aether/contracts';
import { DEPARTMENTS } from '@aether/kernel';
import { useT } from '../../ui/useT.js';
import { LIVENESS_LABEL, type SessionFilters } from './sessions-filter.js';
import { tokensByDepartment } from '../../lib/sessions/localSessions.js';

type Locale = 'zh-TW' | 'en';

function DepartmentSelect({
  value,
  locale,
  onChange,
}: {
  value: string;
  locale: Locale;
  onChange: (next: string) => void;
}) {
  const t = useT();
  return (
    <select aria-label={t('floor')} value={value} onChange={(e) => onChange(e.target.value)}>
      <option value="">{t('allDepartments')}</option>
      {DEPARTMENTS.map((d) => (
        <option key={d.id} value={d.id}>
          {d.floor + 1}F · {locale === 'zh-TW' ? d.zh : d.en}
        </option>
      ))}
    </select>
  );
}

function LivenessSelect({ value, onChange }: { value: string; onChange: (next: string) => void }) {
  const t = useT();
  return (
    <select aria-label={t('status')} value={value} onChange={(e) => onChange(e.target.value)}>
      <option value="">{t('allLiveness')}</option>
      {(['active', 'idle', 'dormant', 'orphaned', 'ended'] as const).map((state) => (
        <option key={state} value={state}>
          {t(LIVENESS_LABEL[state])}
        </option>
      ))}
    </select>
  );
}

export function FilterBar({
  filters,
  onChange,
  locale,
  children,
}: {
  filters: SessionFilters;
  onChange: (next: Partial<SessionFilters>) => void;
  locale: Locale;
  children: ReactNode;
}) {
  const t = useT();
  return (
    <div className="filters">
      <input
        type="search"
        aria-label={t('search')}
        placeholder={t('sessionsSearch')}
        value={filters.query}
        onChange={(e) => onChange({ query: e.target.value })}
      />
      <select
        aria-label={t('provider')}
        value={filters.provider}
        onChange={(e) => onChange({ provider: e.target.value })}
      >
        <option value="">Claude + Codex</option>
        <option value="claude">Claude</option>
        <option value="codex">Codex</option>
      </select>
      <DepartmentSelect
        value={filters.department}
        locale={locale}
        onChange={(department) => onChange({ department })}
      />
      <LivenessSelect value={filters.liveness} onChange={(liveness) => onChange({ liveness })} />
      <label>
        <input
          type="checkbox"
          checked={filters.runningOnly}
          onChange={(e) => onChange({ runningOnly: e.target.checked })}
        />
        {t('runningOnly')}
      </label>
      {children}
    </div>
  );
}

export function DepartmentTokens({
  rows,
  locale,
}: {
  rows: readonly AttributedSession[];
  locale: Locale;
}) {
  const t = useT();
  const compact = new Intl.NumberFormat(locale, { notation: 'compact' });
  return (
    <ul className="token-split" aria-label={t('tokensByDepartment')}>
      {tokensByDepartment(rows).map((d) => {
        const dept = DEPARTMENTS.find((x) => x.id === d.department);
        return (
          <li key={d.department}>
            <span>{dept ? (locale === 'zh-TW' ? dept.zh : dept.en) : d.department}</span>
            <b>
              {compact.format(d.tokens)} {t('tokensUnit')}
            </b>
            <small>
              {d.sessions} {t('sessionCount')}
            </small>
          </li>
        );
      })}
    </ul>
  );
}
