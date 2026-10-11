import {
  SESSION_ACTIVE_MS,
  SESSION_GONE_MS,
  type Agent,
  type LocalSession,
} from '@aether/contracts';
import { formatSpan } from '@aether/kernel';
import { apparitionOf, type Apparition } from '@aether/office-scene/model';
import { translate } from '../i18n/i18n.js';
import { LOCAL_PREFIX } from './session-names.js';

export function activityOf(session: LocalSession, now: number): Agent['activity'] {
  // Hook events are authoritative when installed; otherwise the process table, then a file-mtime heuristic.
  if (session.hook?.activity === 'ended') return 'offline';
  // A hook state is only as fresh as its last event: with no process behind it, a long-silent one is stale.
  if (session.hook && session.process === 'none' && now - session.hook.at > SESSION_GONE_MS)
    return 'offline';
  if (session.hook?.activity === 'waiting_permission') return 'waiting_permission';
  if (session.hook) return session.hook.activity === 'working' ? 'working' : 'idle';
  if (session.process === 'none') return now - session.mtime < SESSION_GONE_MS ? 'idle' : 'offline';
  return now - session.mtime < SESSION_ACTIVE_MS ? 'working' : 'idle';
}

const NOTE = {
  dormant: { 'zh-TW': '休眠', en: 'dormant' },
  orphaned: { 'zh-TW': '孤兒', en: 'orphaned' },
} as const;
export const noteOf = (s: Pick<LocalSession, 'liveness'>, locale: 'zh-TW' | 'en') => {
  const state =
    s.liveness.state in NOTE ? ` · ${NOTE[s.liveness.state as keyof typeof NOTE][locale]}` : '';
  const zombies = s.liveness.zombies.length
    ? ` · ${translate(locale, 'zombiesWord')} ×${s.liveness.zombies.length}`
    : '';
  return state + zombies;
};

export const needsAttention = (s: Pick<LocalSession, 'liveness'>) =>
  ['dormant', 'orphaned'].includes(s.liveness.state) || s.liveness.zombies.length > 0;

export function apparitionsOf(
  sessions: readonly LocalSession[],
): Record<string, Exclude<Apparition, 'zombie'>> {
  return Object.fromEntries(
    sessions.flatMap((s) => {
      const form = apparitionOf(s.liveness.state);
      return form ? [[`${LOCAL_PREFIX}${s.key}`, form] as const] : [];
    }),
  );
}

export function zombiesOf(sessions: readonly LocalSession[]): Record<string, number> {
  return Object.fromEntries(
    sessions.flatMap((s) =>
      s.liveness.zombies.length
        ? [[`${LOCAL_PREFIX}${s.key}`, s.liveness.zombies.length] as const]
        : [],
    ),
  );
}

export function attentionReason(
  s: Pick<LocalSession, 'liveness'>,
  locale: 'zh-TW' | 'en' = 'zh-TW',
): string | null {
  const parts: string[] = [];
  const { state, quietMs, zombies } = s.liveness;
  if (state === 'dormant' || state === 'orphaned') {
    const name = NOTE[state][locale];
    parts.push(quietMs !== null ? `${name} ${formatSpan(quietMs, locale)}` : name);
  }
  if (zombies.length) {
    const programs = [...new Set(zombies.map((z) => z.program).filter(Boolean))].slice(0, 3);
    parts.push(
      `${translate(locale, 'zombiesWord')} ×${zombies.length}${programs.length ? ` (${programs.join(', ')})` : ''}`,
    );
  }
  return parts.length ? parts.join(' · ') : null;
}

export function attentionOf(
  sessions: readonly LocalSession[],
  locale: 'zh-TW' | 'en',
): Record<string, string> {
  return Object.fromEntries(
    sessions.flatMap((s) => {
      const reason = attentionReason(s, locale);
      return reason ? [[`${LOCAL_PREFIX}${s.key}`, reason] as const] : [];
    }),
  );
}
