/**
 * ConAI brand identity — single source of truth for colors, typography and logo metadata.
 * The visual token names mirror `packages/ui/src/styles/tokens.css` (Tailwind @theme).
 */

export const BRAND = {
  name: 'ConAI',
  domain: 'conai.dpdns.org',
  tagline: 'Your free-first AI workspace',
  colors: {
    /** Primary Violet — official brand primary */
    primaryViolet: '#7C3AED',
    /** Deep Indigo — official brand secondary */
    deepIndigo: '#4338CA',
    /** Soft Lavender — official brand accent */
    softLavender: '#A78BFA',
    /** App background */
    background: '#F8F9FC',
    /** Card / elevated surface */
    surface: '#FFFFFF',
    /** Default text color */
    text: '#18181B',
  },
  fonts: {
    heading: "'Plus Jakarta Sans', ui-sans-serif, system-ui, sans-serif",
    body: 'Inter, ui-sans-serif, system-ui, sans-serif',
    mono: "'JetBrains Mono', ui-monospace, SFMono-Regular, monospace",
  },
  logo: {
    /**
     * The official ConAI logo SVG has not been supplied yet. The built-in component
     * (`@conai/ui` Logo) is a *temporary vector* clearly labeled as such: a geometric C
     * enclosing a four-pointed spark, per brand guidance. Replace when official asset lands.
     */
    status: 'temporary-vector' as const,
    description: 'A geometric C enclosing a four-pointed spark',
  },
} as const;

/** Supported UI languages. English is the default. */
export const LANGUAGES = ['en', 'vi'] as const;
export type Language = (typeof LANGUAGES)[number];
export const DEFAULT_LANGUAGE: Language = 'en';

/** Theme modes. `system` follows the OS preference. */
export const THEME_MODES = ['light', 'dark', 'system'] as const;
export type ThemeMode = (typeof THEME_MODES)[number];

export const FONT_SIZES = ['sm', 'md', 'lg'] as const;
export type FontSize = (typeof FONT_SIZES)[number];
