import { createContext, useCallback, useContext, useMemo, type ReactNode } from 'react';
import {
  DEFAULT_LANGUAGE,
  translate,
  type I18nKey,
  type Language,
  type TranslateParams,
} from '@conai/shared';
import { usePreferences } from '../theme/preferences';

export type TranslateFn = (key: I18nKey, params?: TranslateParams) => string;

interface I18nContextValue {
  t: TranslateFn;
  language: Language;
  setLanguage: (lang: Language) => void;
}

const I18nContext = createContext<I18nContextValue | null>(null);

/**
 * Provides UI translation backed by the persisted language preference (en default, vi supported).
 * Dictionaries live in @conai/shared; the preference store persists the choice.
 */
export function I18nProvider({ children }: { children: ReactNode }) {
  const language = usePreferences((s) => s.language);
  const setLanguage = usePreferences((s) => s.setLanguage);

  const t = useCallback<TranslateFn>(
    (key, params) => translate(language ?? DEFAULT_LANGUAGE, key, params),
    [language],
  );

  const value = useMemo<I18nContextValue>(
    () => ({ t, language: language ?? DEFAULT_LANGUAGE, setLanguage }),
    [t, language, setLanguage],
  );

  return <I18nContext.Provider value={value}>{children}</I18nContext.Provider>;
}

export function useI18n(): I18nContextValue {
  const ctx = useContext(I18nContext);
  if (!ctx) throw new Error('useI18n must be used within <I18nProvider>');
  return ctx;
}
