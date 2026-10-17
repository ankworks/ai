import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { ConaiProviders, initPreferences } from '@conai/ui';
import App from './App';
import './index.css';

// Apply theme/language/font preferences to <html> BEFORE the first render.
initPreferences();

const queryClient = new QueryClient({
  defaultOptions: { queries: { retry: 1, staleTime: 30_000, refetchOnWindowFocus: false } },
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
