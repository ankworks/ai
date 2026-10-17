import { useEffect, useState, type FormEvent } from 'react';
import { useNavigate } from 'react-router-dom';
import { ExternalLink, Loader2 } from 'lucide-react';
import { Button, Input, Label, useI18n } from '@conai/ui';
import type { Language } from '@conai/shared';
import { AuthShell } from '../../components/AuthShell';
import { apiFetch, type MeResponse } from '../../lib/api';
import { publicEnv } from '../../env';

/**
 * Account Setup (spec §8): after credentials exist, confirm the profile that
 * the workspace will use — display name + language — then continue into the
 * product. The @username was chosen during sign-up (shown read-only here).
 */
export function SetupPage() {
  const { t, language, setLanguage } = useI18n();
  const navigate = useNavigate();

  const [displayName, setDisplayName] = useState('');
  const [username, setUsername] = useState('');
  const [profileLocale, setProfileLocale] = useState<Language>('en');
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [pending, setPending] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    apiFetch<MeResponse>('/v1/me')
      .then((me) => {
        if (cancelled) return;
        setDisplayName(me.user.displayName);
        setUsername(me.user.username);
        setProfileLocale(me.user.locale);
        setLoading(false);
      })
      .catch(() => {
        if (!cancelled) {
          setLoadError(t('auth.err.generic'));
          setLoading(false);
        }
      });
    return () => {
      cancelled = true;
    };
  }, [t]);

  async function onSubmit(e: FormEvent) {
    e.preventDefault();
    setPending(true);
    setError(null);
    try {
      await apiFetch<{ user: unknown }>('/v1/me', {
        method: 'PATCH',
        json: { displayName: displayName.trim(), locale: profileLocale },
      });
      if (profileLocale !== language) setLanguage(profileLocale);
      navigate('/', { replace: true });
    } catch (err) {
      setError(err instanceof Error ? err.message : t('auth.err.generic'));
    } finally {
      setPending(false);
    }
  }

  if (loading) {
    return (
      <AuthShell title={t('auth.setupTitle')}>
        <div className="text-muted-foreground flex items-center justify-center gap-2 py-6 text-sm">
          <Loader2 className="h-4 w-4 animate-spin" aria-hidden />
          {t('common.loading')}
        </div>
      </AuthShell>
    );
  }

  if (loadError) {
    return (
      <AuthShell title={t('auth.setupTitle')}>
        <p className="text-destructive text-sm" role="alert">
          {loadError}
        </p>
      </AuthShell>
    );
  }

  return (
    <AuthShell
      title={t('auth.setupTitle')}
      subtitle={t('auth.setupSubtitle')}
      footer={
        <button
          type="button"
          className="text-muted-foreground hover:text-primary text-sm"
          onClick={() => navigate('/')}
        >
          {t('auth.setupSkip')}
        </button>
      }
    >
      <form onSubmit={onSubmit} className="space-y-4">
        <div className="space-y-2">
          <Label htmlFor="setup-username">{t('auth.username')}</Label>
          <Input id="setup-username" value={`@${username}`} readOnly className="opacity-80" />
          <p className="text-muted-foreground text-xs">{t('auth.usernameLocked')}</p>
        </div>
        <div className="space-y-2">
          <Label htmlFor="setup-name">{t('auth.displayName')}</Label>
          <Input
            id="setup-name"
            required
            maxLength={60}
            value={displayName}
            onChange={(e) => setDisplayName(e.target.value)}
          />
        </div>
        <div className="space-y-2">
          <Label htmlFor="setup-locale">{t('common.language')}</Label>
          <select
            id="setup-locale"
            className="border-border bg-surface text-foreground focus:border-primary h-10 w-full rounded-lg border px-3 text-sm outline-none"
            value={profileLocale}
            onChange={(e) => setProfileLocale(e.target.value as Language)}
          >
            <option value="en">English</option>
            <option value="vi">Tiếng Việt</option>
          </select>
        </div>

        {error ? (
          <p className="text-destructive text-sm" role="alert">
            {error}
          </p>
        ) : null}

        <Button type="submit" className="w-full" disabled={pending}>
          {pending ? <Loader2 className="h-4 w-4 animate-spin" /> : t('auth.setupAction')}
        </Button>

        <a href={publicEnv.VITE_WORKSPACE_URL} className="block">
          <Button type="button" variant="outline" className="w-full">
            <ExternalLink className="h-4 w-4" aria-hidden />
            {t('auth.setupWorkspace')}
          </Button>
        </a>
      </form>
    </AuthShell>
  );
}
