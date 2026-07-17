import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { Toaster } from 'react-hot-toast';
import './i18n';
import './index.css';
import App from './App';
import { flushOffline } from './lib/offline';

const queryClient = new QueryClient({
  defaultOptions: {
    queries: { retry: 2, staleTime: 30_000 },
  },
});

// Flush any queued offline kiosk work (reports, check-ins, resolves) whenever
// connectivity returns — and once on load — so nothing stays stranded after the
// team screen that queued it has closed. Best-effort and idempotent.
flushOffline().catch(() => {});
window.addEventListener('online', () => { flushOffline().catch(() => {}); });

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <QueryClientProvider client={queryClient}>
      <App />
      <Toaster
        position="bottom-center"
        toastOptions={{
          style: {
            background: '#1a1f2e',
            color: '#fff',
            border: '1px solid rgba(0,229,204,0.3)',
          },
        }}
      />
    </QueryClientProvider>
  </StrictMode>,
);
