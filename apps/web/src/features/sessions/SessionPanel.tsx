import { lazy, Suspense, useLayoutEffect, useRef } from 'react';
import { PanelRightClose, PanelRightOpen, X } from 'lucide-react';
import { usePreferences } from '../../lib/preferences/state.js';
import { useT } from '../../ui/useT.js';
import { attentionCount, type Feed } from '../feed/feed-model.js';
import type { PanelProps } from '../shell-chrome/PanelBody.js';
import { PanelResizer } from '../shell-chrome/PanelResizer.js';
import { usePanelLayout } from './use-panel-layout.js';

export type { PanelProps };

const LazyBody = lazy(() =>
  import('../shell-chrome/PanelBody.js').then((m) => ({ default: m.PanelBody })),
);

export function PanelBody(props: PanelProps) {
  const t = useT();
  return (
    <Suspense
      fallback={
        <div className="panel-feed">
          <header className="panel-head">
            <h2>{t('panelTitle')}</h2>
            {props.trailing}
          </header>
        </div>
      }
    >
      <LazyBody {...props} />
    </Suspense>
  );
}

function PanelRail({ feed, onExpand }: { feed: Feed; onExpand: () => void }) {
  const t = useT();
  const needs = feed.needs.length;
  const unread = attentionCount(feed) - needs;
  return (
    <div className="panel-rail">
      <button className="icon-button" aria-label={t('panelExpand')} onClick={onExpand}>
        <PanelRightOpen size={17} />
      </button>
      {needs > 0 && (
        <span
          className="count-badge"
          title={t('feedNeeds')}
          aria-label={`${needs} ${t('feedNeeds')}`}
        >
          {needs}
        </span>
      )}
      {unread > 0 && (
        <span
          className="count-badge unread"
          title={t('feedUnread')}
          aria-label={`${unread} ${t('feedUnread')}`}
        >
          {unread}
        </span>
      )}
    </div>
  );
}

function PanelControls({
  resizable,
  onCollapse,
  onClose,
}: {
  resizable: boolean;
  onCollapse: () => void;
  onClose: () => void;
}) {
  const t = useT();
  return (
    <>
      {resizable && (
        <button
          className="icon-button"
          aria-label={t('panelCollapse')}
          title={t('panelCollapse')}
          onClick={onCollapse}
        >
          <PanelRightClose size={17} />
        </button>
      )}
      <button className="icon-button" aria-label={t('close')} title={t('close')} onClick={onClose}>
        <X size={17} />
      </button>
    </>
  );
}

export function SessionPanel(props: Omit<PanelProps, 'trailing'> & { onClose: () => void }) {
  const t = useT();
  const { onClose, feed, ...body } = props;
  const layout = usePanelLayout();
  const still = usePreferences((s) => s.reducedMotion);
  const aside = useRef<HTMLElement>(null);
  const { occupied } = layout;
  useLayoutEffect(() => {
    const host = aside.current?.parentElement;
    host?.style.setProperty('--panel-w', `${occupied}px`);
    return () => {
      host?.style.removeProperty('--panel-w');
    };
  }, [occupied]);
  return (
    <aside
      ref={aside}
      className={`session-panel ${layout.collapsed ? 'rail' : ''} ${still ? 'still' : ''}`}
      aria-label={t('panelTitle')}
    >
      {layout.resizable && !layout.collapsed && (
        <PanelResizer
          width={layout.width}
          viewport={layout.viewport}
          onCommit={layout.setWidth}
          onCollapse={() => layout.setCollapsed(true)}
        />
      )}
      {layout.collapsed ? (
        <PanelRail feed={feed} onExpand={() => layout.setCollapsed(false)} />
      ) : (
        <PanelBody
          {...body}
          feed={feed}
          trailing={
            <PanelControls
              resizable={layout.resizable}
              onCollapse={() => layout.setCollapsed(true)}
              onClose={onClose}
            />
          }
        />
      )}
    </aside>
  );
}
