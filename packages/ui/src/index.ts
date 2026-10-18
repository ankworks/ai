// ── Utilities & theme ────────────────────────────────────────────────────────
export { cn } from './lib/utils';
export * from './theme/preferences';
export { I18nProvider, useI18n, type TranslateFn } from './i18n/provider';
export { ConaiProviders } from './providers';

// Re-export shared DTO/brand types so app code has a single import path (@conai/ui).
export type * from '@conai/shared';

// ── Components ───────────────────────────────────────────────────────────────
export * from './components/button';
export * from './components/badge';
export * from './components/card';
export * from './components/input';
export * from './components/label';
export * from './components/separator';
export * from './components/skeleton';
export * from './components/avatar';
export * from './components/tabs';
export * from './components/switch';
export * from './components/tooltip';
export * from './components/dropdown-menu';
export * from './components/dialog';
export * from './components/select';
export * from './components/logo';
export { ThemeToggle, LanguageToggle } from './components/toggles';
