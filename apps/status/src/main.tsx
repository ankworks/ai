import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { ConaiProviders, initPreferences } from '@conai/ui';
import App from './App';
import './index.css';

initPreferences();

const queryClient = new QueryClient({
  defaultOptions: { queries: { retry: 1, staleTime: 15_000, refetchOnWindowFocus: true } },
});

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <QueryClientProvider client={queryClient}>
      <ConaiProviders>
        <App />
      </ConaiProviders>
    </QueryClientProvider>
  </StrictMode>,
);
