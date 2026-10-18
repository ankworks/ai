import { Check, Languages, Monitor, Moon, Sun } from 'lucide-react';
import { DEFAULT_LANGUAGE, LANGUAGES, type Language, type ThemeMode } from '@conai/shared';
import { usePreferences } from '../theme/preferences';
import { useI18n } from '../i18n/provider';
import { Button } from './button';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from './dropdown-menu';

const THEME_ITEMS: Array<{
  value: ThemeMode;
  icon: typeof Sun;
  labelKey: 'common.themeLight' | 'common.themeDark' | 'common.themeSystem';
}> = [
  { value: 'light', icon: Sun, labelKey: 'common.themeLight' },
  { value: 'dark', icon: Moon, labelKey: 'common.themeDark' },
  { value: 'system', icon: Monitor, labelKey: 'common.themeSystem' },
];

/** Theme switch: Light / Dark / System — persisted per device. */
export function ThemeToggle() {
  const theme = usePreferences((s) => s.theme);
  const setTheme = usePreferences((s) => s.setTheme);
  const { t } = useI18n();
  const CurrentIcon = theme === 'dark' ? Moon : theme === 'system' ? Monitor : Sun;

  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <Button variant="ghost" size="iconSm" aria-label={t('common.theme')}>
          <CurrentIcon className="h-4 w-4" />
        </Button>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="end">
        <DropdownMenuLabel>{t('common.theme')}</DropdownMenuLabel>
        <DropdownMenuSeparator />
        {THEME_ITEMS.map(({ value, icon: Icon, labelKey }) => (
          <DropdownMenuItem key={value} onSelect={() => setTheme(value)}>
            <Icon className="h-4 w-4" />
            {t(labelKey)}
            {theme === value ? <Check className="ml-auto h-4 w-4" /> : null}
          </DropdownMenuItem>
        ))}
      </DropdownMenuContent>
    </DropdownMenu>
  );
}

const LANGUAGE_LABELS: Record<Language, string> = {
  en: 'English',
  vi: 'Tiếng Việt',
};

/** Language switch: English (default) / Vietnamese. */
export function LanguageToggle() {
  const language = usePreferences((s) => s.language);
  const setLanguage = usePreferences((s) => s.setLanguage);
  const { t } = useI18n();

  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <Button variant="ghost" size="sm" aria-label={t('common.language')}>
          <Languages className="h-4 w-4" />
          {(language ?? DEFAULT_LANGUAGE).toUpperCase()}
        </Button>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="end">
        <DropdownMenuLabel>{t('common.language')}</DropdownMenuLabel>
        <DropdownMenuSeparator />
        {LANGUAGES.map((lang) => (
          <DropdownMenuItem key={lang} onSelect={() => setLanguage(lang)}>
            {LANGUAGE_LABELS[lang]}
            {(language ?? DEFAULT_LANGUAGE) === lang ? <Check className="ml-auto h-4 w-4" /> : null}
          </DropdownMenuItem>
        ))}
      </DropdownMenuContent>
    </DropdownMenu>
  );
}
