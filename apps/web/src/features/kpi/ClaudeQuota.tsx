import { useQuery } from '@tanstack/react-query';
import type { ClaudeLimits, ClaudeLimitsResponse } from '@aether/contracts';
import { api } from '../../lib/api/api.js';
import { useT } from '../../ui/useT.js';
import { quotaNearLimit, quotaText } from './quota.js';
import { POLL, poll } from '../../lib/app/polling.js';

export const when = (ms: number, timeZone = 'Asia/Taipei') =>
  new Intl.DateTimeFormat('en-GB', {
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
    hour12: false,
    timeZone,
  }).format(ms);

export function ClaudeQuota() {
  const t = useT();
  const limits = useQuery({
    queryKey: ['claude-limits'],
    queryFn: () => api<ClaudeLimitsResponse>('/api/claude-limits'),
    ...poll(POLL.rare),
    retry: false,
  }).data?.limits;
  const line = (label: string, w: ClaudeLimits['fiveHour']) =>
    w
      ? `${label} ${Math.round(w.usedPercent)}%${w.resetsAt ? ` (${t('quotaReset')} ${when(w.resetsAt)})` : ''}`
      : null;
  const title = limits
    ? [
        line(t('fiveHourWindow'), limits.fiveHour),
        line(t('sevenDayWindow'), limits.sevenDay),
        limits.plan,
        `${t('quotaUpdated')} ${when(limits.updatedAt)}`,
        limits.stale ? t('quotaStale') : null,
      ]
        .filter(Boolean)
        .join(' · ')
    : t('claudeQuotaUnknown');
  return (
    <div title={title}>
      <dt>CLAUDE</dt>
      <dd
        className={[limits && quotaNearLimit(limits) ? 'warn' : '', limits?.stale ? 'stale' : '']
          .join(' ')
          .trim()}
      >
        {limits ? quotaText(limits) : '—'}
      </dd>
    </div>
  );
}
