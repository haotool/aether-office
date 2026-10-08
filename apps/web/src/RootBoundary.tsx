import { Component, type ReactNode } from 'react';
import { isChunkLoadError, mayReloadForChunk } from './lib/app/root-boundary.js';

/** The last line of defense: any render error would otherwise leave a blank page. */
export class RootBoundary extends Component<{ children: ReactNode }, { error: unknown }> {
  override state = { error: null as unknown };
  static getDerivedStateFromError(error: unknown) {
    return { error: error ?? new Error('unknown') };
  }
  override componentDidCatch(error: unknown) {
    if (isChunkLoadError(error) && mayReloadForChunk(window.sessionStorage, Date.now())) {
      window.location.reload();
    }
  }
  override render() {
    if (this.state.error === null) return this.props.children;
    return (
      <main role="alert">
        <p>頁面無法顯示 / The page could not be shown.</p>
        <button type="button" onClick={() => window.location.reload()}>
          重新載入 / Reload
        </button>
      </main>
    );
  }
}
