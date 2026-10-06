import React from 'react';
import { createRoot } from 'react-dom/client';
import { BrowserRouter } from 'react-router-dom';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { App } from './App.js';
import { RootBoundary } from './RootBoundary.js';
import { startServiceWorker } from './pwa.js';
import { watchInstall } from './install-prompt.js';
import './styles/index.css';
const client = new QueryClient({
  defaultOptions: { queries: { staleTime: 2000, retry: 1, refetchOnWindowFocus: true } },
});
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
