import { useEffect, useMemo, useState } from 'react';
import type { LocalSession } from '@aether/contracts';
import { rowLabelOf } from '../../lib/sessions/session-names.js';
import { useLocale, useT } from '../../ui/useT.js';
import { asksOf, bannerOf } from './need-banner.js';
import { useNeedAlarm } from './use-need-alarm.js';
import { useNeedShortcut } from './use-need-shortcut.js';

const TICK_MS = 15_000;

type NeedBannerProps = {
  sessions: readonly LocalSession[] | undefined;
  asking: ReadonlySet<string>;
  notify: boolean;
  onOpen: (key: string) => void;
};

export function NeedBanner({ sessions, asking, notify, onOpen }: NeedBannerProps) {
  const t = useT();
  const locale = useLocale();
  const [now, setNow] = useState(() => Date.now());
  useEffect(() => {
    const timer = setInterval(() => setNow(Date.now()), TICK_MS);
    return () => clearInterval(timer);
  }, []);
  const asks = useMemo(() => asksOf(sessions, asking, rowLabelOf, now), [sessions, asking, now]);
  const banner = bannerOf(asks, now, locale);
  useNeedAlarm(asks, notify);
  useNeedShortcut(banner?.key, onOpen);
  if (!banner) return null;
  const detail = [banner.detail, banner.waited].filter(Boolean).join(' · ');
  return (
    <div className="notice" role="alert">
      <span>
        <strong>
          {banner.label} {t('needBannerNeeds')}
        </strong>
        {detail && ` · ${detail}`}
        {banner.more > 0 && ` · +${banner.more}`}
      </span>
      <button onClick={() => onOpen(banner.key)}>{t('needBannerGo')}</button>
    </div>
  );
}
