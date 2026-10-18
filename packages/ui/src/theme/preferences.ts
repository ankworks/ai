import { create } from 'zustand';
import { persist } from 'zustand/middleware';
import {
  DEFAULT_LANGUAGE,
  FONT_SIZES,
  THEME_MODES,
  detectLanguage,
  type FontSize,
  type Language,
  type ThemeMode,
} from '@conai/shared';

export type ResolvedTheme = 'light' | 'dark';

export interface PreferencesState {
  theme: ThemeMode;
  resolvedTheme: ResolvedTheme;
  fontSize: FontSize;
  reducedMotion: boolean;
  compact: boolean;
  sidebarCollapsed: boolean;
  language: Language;

  setTheme: (theme: ThemeMode) => void;
  setFontSize: (fontSize: FontSize) => void;
  setReducedMotion: (reduced: boolean) => void;
  setCompact: (compact: boolean) => void;
  setSidebarCollapsed: (collapsed: boolean) => void;
  setLanguage: (language: Language) => void;
}

/** Resolve `system` against the OS preference. */
export function resolveTheme(theme: ThemeMode): ResolvedTheme {
  if (theme !== 'system') return theme;
  if (typeof window === 'undefined' || !window.matchMedia) return 'light';
  return window.matchMedia('(prefers-color-scheme: dark)').matches ? 'dark' : 'light';
}

/** Reflect preferences onto <html> — data attributes drive all token switching. */
export function applyPreferences(state: {
  theme: ThemeMode;
  resolvedTheme: ResolvedTheme;
  fontSize: FontSize;
  reducedMotion: boolean;
  compact: boolean;
  language: Language;
}): void {
  if (typeof document === 'undefined') return;
  const root = document.documentElement;
  root.dataset.theme = state.theme === 'system' ? state.resolvedTheme : state.theme;
  root.dataset.fontSize = state.fontSize;
  root.dataset.density = state.compact ? 'compact' : 'comfortable';
  root.dataset.reducedMotion = String(state.reducedMotion);
  root.lang = state.language;
}

function initialLanguage(): Language {
  if (typeof navigator === 'undefined') return DEFAULT_LANGUAGE;
  return detectLanguage(navigator.languages);
}

function initialReducedMotion(): boolean {
  if (typeof window === 'undefined' || !window.matchMedia) return false;
  return window.matchMedia('(prefers-reduced-motion: reduce)').matches;
}

export const usePreferences = create<PreferencesState>()(
  persist(
    (set, get) => ({
      theme: 'light',
      resolvedTheme: 'light',
      fontSize: 'md',
      reducedMotion: initialReducedMotion(),
      compact: false,
      sidebarCollapsed: false,
      language: initialLanguage(),

      setTheme: (theme) => {
        const resolvedTheme = resolveTheme(theme);
        set({ theme, resolvedTheme });
        applyPreferences({ ...pick(get()), theme, resolvedTheme });
      },
      setFontSize: (fontSize) => {
        set({ fontSize });
        applyPreferences({ ...pick(get()), fontSize });
      },
      setReducedMotion: (reducedMotion) => {
        set({ reducedMotion });
        applyPreferences({ ...pick(get()), reducedMotion });
      },
      setCompact: (compact) => {
        set({ compact });
        applyPreferences({ ...pick(get()), compact });
      },
      setSidebarCollapsed: (sidebarCollapsed) => set({ sidebarCollapsed }),
      setLanguage: (language) => {
        set({ language });
        applyPreferences({ ...pick(get()), language });
      },
    }),
    {
      name: 'conai.preferences',
      version: 1,
      partialize: (s) => ({
        theme: s.theme,
        fontSize: s.fontSize,
        reducedMotion: s.reducedMotion,
        compact: s.compact,
        sidebarCollapsed: s.sidebarCollapsed,
        language: s.language,
      }),
      onRehydrateStorage: () => (state) => {
        if (state) {
          state.resolvedTheme = resolveTheme(state.theme);
          applyPreferences({
            theme: state.theme,
            resolvedTheme: state.resolvedTheme,
            fontSize: state.fontSize,
            reducedMotion: state.reducedMotion,
            compact: state.compact,
            language: state.language,
          });
        }
      },
    },
  ),
);

function pick(s: PreferencesState) {
  return {
    theme: s.theme,
    resolvedTheme: s.resolvedTheme,
    fontSize: s.fontSize,
    reducedMotion: s.reducedMotion,
    compact: s.compact,
    language: s.language,
  };
}

let systemListenerAttached = false;

/**
 * Call once in each app's entry point BEFORE the first render:
 * applies persisted preferences to <html> (no theme flash) and keeps `system`
 * in sync with OS changes.
 */
export function initPreferences(): void {
  if (typeof window === 'undefined') return;
  const state = usePreferences.getState();
  const resolvedTheme = resolveTheme(state.theme);
  usePreferences.setState({ resolvedTheme });
  applyPreferences({ ...state, resolvedTheme });

  if (!systemListenerAttached && window.matchMedia) {
    systemListenerAttached = true;
    const query = window.matchMedia('(prefers-color-scheme: dark)');
    const onChange = () => {
      const current = usePreferences.getState();
      if (current.theme === 'system') {
        const resolved = query.matches ? 'dark' : 'light';
        usePreferences.setState({ resolvedTheme: resolved });
        applyPreferences({ ...pick(current), resolvedTheme: resolved });
      }
    };
    query.addEventListener('change', onChange);
  }
}

export const isThemeMode = (v: unknown): v is ThemeMode =>
  typeof v === 'string' && (THEME_MODES as readonly string[]).includes(v);
export const isFontSize = (v: unknown): v is FontSize =>
  typeof v === 'string' && (FONT_SIZES as readonly string[]).includes(v);
