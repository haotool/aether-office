import { useT, useLocale } from '../../ui/useT.js';
import { useMoments } from './life-moments.js';

/**
 * The little moments the 3D office showed for this member, newest first, closed by default: the same lines the scene's
 * hidden log says, kept for a few minutes of looking back. Marked decorative, because they are pictures and jokes, not
 * facts about the work. Nothing shows until the office has shown one.
 */
export function RecentMoments({ member }: { member: string }) {
  const t = useT();
  const locale = useLocale();
  const moments = useMoments(member);
  if (!moments.length) return null;
  return (
    <details className="conv-moments">
      <summary>
        {t('momentsTitle')} <span className="moments-count">{moments.length}</span>
        <span className="moments-badge">{t('momentsDecorative')}</span>
      </summary>
      <ul>
        {moments.map((m) => (
          <li key={`${m.rule}:${m.at}`}>
            <time dateTime={new Date(m.at).toISOString()}>
              {new Date(m.at).toLocaleTimeString(locale, { hour: '2-digit', minute: '2-digit' })}
            </time>
            <span>{m.text}</span>
          </li>
        ))}
      </ul>
    </details>
  );
}
