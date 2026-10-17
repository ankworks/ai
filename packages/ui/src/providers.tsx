import type { ReactNode } from 'react';
import { TooltipProvider } from './components/tooltip';
import { I18nProvider } from './i18n/provider';

/**
 * Standard provider stack every ConAI app wraps its tree with:
 * i18n (language-aware t()) + tooltip infrastructure.
 * Theme/motion preferences are applied by `initPreferences()` in main.tsx BEFORE render.
 */
export function ConaiProviders({ children }: { children: ReactNode }) {
  return (
    <TooltipProvider delayDuration={250}>
      <I18nProvider>{children}</I18nProvider>
    </TooltipProvider>
  );
}
