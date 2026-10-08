import React from 'react';
import { createRoot } from 'react-dom/client';
import { BrowserRouter } from 'react-router-dom';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { App } from './App.js';
import { loadLocale } from './i18n.js';
import { usePreferences } from './state.js';
import { RootBoundary } from './RootBoundary.js';
import { startServiceWorker } from './pwa.js';
import { watchInstall } from './install-prompt.js';
import './styles/index.css';
const client = new QueryClient({
  defaultOptions: { queries: { staleTime: 2000, retry: 1, refetchOnWindowFocus: true } },
});
// The page's own language is downloaded before the first render, so neither the login nor the app flashes keys.
await loadLocale(usePreferences.getState().locale);
watchInstall();
startServiceWorker();
createRoot(document.getElementById('root')!).render(
  <React.StrictMode>
    <QueryClientProvider client={client}>
      <BrowserRouter>
        <RootBoundary>
          <App />
        </RootBoundary>
      </BrowserRouter>
    </QueryClientProvider>
  </React.StrictMode>,
);
// Once the page is up and the network is quiet, the code a click would need is fetched, so a first visit to a page or the
// conversation panel does not wait for it.
window.addEventListener('load', () =>
  setTimeout(() => {
    void import('./features/PanelBody.js');
    void import('./features/ProjectPage.js');
  }, 1500),
);
