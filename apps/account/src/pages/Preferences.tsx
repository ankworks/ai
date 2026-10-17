import {
  Button,
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
  Label,
  Separator,
  Switch,
  useI18n,
  usePreferences,
} from '@conai/ui';
import { cn } from '@conai/ui';
import type { FontSize, ThemeMode } from '@conai/shared';

const THEME_OPTIONS: Array<{
  value: ThemeMode;
  labelKey: 'common.themeLight' | 'common.themeDark' | 'common.themeSystem';
}> = [
  { value: 'light', labelKey: 'common.themeLight' },
  { value: 'dark', labelKey: 'common.themeDark' },
  { value: 'system', labelKey: 'common.themeSystem' },
];

const FONT_OPTIONS: Array<{
  value: FontSize;
  labelKey: 'pref.fontSizeSm' | 'pref.fontSizeMd' | 'pref.fontSizeLg';
}> = [
  { value: 'sm', labelKey: 'pref.fontSizeSm' },
  { value: 'md', labelKey: 'pref.fontSizeMd' },
  { value: 'lg', labelKey: 'pref.fontSizeLg' },
];

function Row({
  label,
  description,
  children,
}: {
  label: string;
  description?: string;
  children: React.ReactNode;
}) {
  return (
    <div className="flex flex-col gap-3 py-4 sm:flex-row sm:items-center sm:justify-between">
      <div className="space-y-0.5">
        <Label>{label}</Label>
        {description ? <p className="text-muted-foreground text-xs">{description}</p> : null}
      </div>
      <div className="shrink-0">{children}</div>
    </div>
  );
}

/**
 * Preferences — fully functional in Phase 1: theme, font size, reduced motion,
 * compact mode, sidebar collapse, interface language. Persisted per device.
 */
export function Preferences() {
  const { t, language, setLanguage } = useI18n();
  const prefs = usePreferences();

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold md:text-3xl">{t('pref.title')}</h1>
        <p className="text-muted-foreground mt-1 text-sm">{t('pref.description')}</p>
      </div>

      <Card>
        <CardHeader>
          <CardTitle>{t('pref.appearance')}</CardTitle>
          <CardDescription>{t('common.theme')}</CardDescription>
        </CardHeader>
        <CardContent className="divide-border divide-y">
          <Row label={t('common.theme')}>
            <div className="border-border bg-surface inline-flex rounded-lg border p-1">
              {THEME_OPTIONS.map(({ value, labelKey }) => (
                <Button
                  key={value}
                  size="sm"
                  variant={prefs.theme === value ? 'secondary' : 'ghost'}
                  aria-pressed={prefs.theme === value}
                  onClick={() => prefs.setTheme(value)}
                >
                  {t(labelKey)}
                </Button>
              ))}
            </div>
          </Row>

          <Row label={t('pref.fontSize')}>
            <div className="border-border bg-surface inline-flex rounded-lg border p-1">
              {FONT_OPTIONS.map(({ value, labelKey }) => (
                <Button
                  key={value}
                  size="sm"
                  variant={prefs.fontSize === value ? 'secondary' : 'ghost'}
                  aria-pressed={prefs.fontSize === value}
                  onClick={() => prefs.setFontSize(value)}
                >
                  {t(labelKey)}
                </Button>
              ))}
            </div>
          </Row>

          <Row label={t('pref.reducedMotion')} description={t('pref.reducedMotionDesc')}>
            <Switch
              checked={prefs.reducedMotion}
              onCheckedChange={prefs.setReducedMotion}
              aria-label={t('pref.reducedMotion')}
            />
          </Row>

          <Row label={t('pref.compactMode')} description={t('pref.compactModeDesc')}>
            <Switch
              checked={prefs.compact}
              onCheckedChange={prefs.setCompact}
              aria-label={t('pref.compactMode')}
            />
          </Row>

          <Row label={t('pref.collapsibleSidebar')} description="Workspace sidebar behavior">
            <Switch
              checked={!prefs.sidebarCollapsed}
              onCheckedChange={(v) => prefs.setSidebarCollapsed(!v)}
              aria-label={t('pref.collapsibleSidebar')}
            />
          </Row>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>{t('pref.language')}</CardTitle>
          <CardDescription>English is the default language.</CardDescription>
        </CardHeader>
        <CardContent>
          <div className="border-border bg-surface inline-flex rounded-lg border p-1">
            <Button
              size="sm"
              variant={language === 'en' ? 'secondary' : 'ghost'}
              aria-pressed={language === 'en'}
              onClick={() => setLanguage('en')}
            >
              English
            </Button>
            <Button
              size="sm"
              variant={language === 'vi' ? 'secondary' : 'ghost'}
              aria-pressed={language === 'vi'}
              onClick={() => setLanguage('vi')}
            >
              Tiếng Việt
            </Button>
          </div>
          <Separator className="my-4" />
          <p className={cn('text-muted-foreground text-xs')}>
            Saved on this device via localStorage · key: <code>conai.preferences</code>
          </p>
        </CardContent>
      </Card>
    </div>
  );
}
