import { useState, type FormEvent } from 'react';
import { useQueryClient } from '@tanstack/react-query';
import { Copy, Check, Loader2 } from 'lucide-react';
import {
  Button,
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
  Input,
  Label,
  Separator,
  useI18n,
} from '@conai/ui';
import type { Language } from '@conai/shared';
import { apiFetch } from '../lib/api';
import type { MeUser } from '../lib/api';
import { useMe } from './Overview';

/**
 * Form state is initialized from fetched data via a keyed child mount — avoids
 * setState-in-effect while still syncing when the query resolves.
 */
function BasicsForm({ initial }: { initial: MeUser }) {
  const { t, language, setLanguage } = useI18n();
  const queryClient = useQueryClient();
  const [displayName, setDisplayName] = useState(initial.displayName);
  const [profileLanguage, setProfileLanguage] = useState<Language>(initial.locale);
  const [pending, setPending] = useState(false);
  const [saved, setSaved] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function onSubmit(e: FormEvent) {
    e.preventDefault();
    setPending(true);
    setError(null);
    setSaved(false);
    try {
      await apiFetch<{ user: unknown }>('/v1/me', {
        method: 'PATCH',
        json: { displayName: displayName.trim(), locale: profileLanguage },
      });
      if (profileLanguage !== language) setLanguage(profileLanguage);
      await queryClient.invalidateQueries({ queryKey: ['me'] });
      setSaved(true);
    } catch (err) {
      setError(err instanceof Error ? err.message : t('auth.err.generic'));
    } finally {
      setPending(false);
    }
  }

  return (
    <form onSubmit={onSubmit} className="space-y-4">
      <div className="grid gap-4 sm:grid-cols-2">
        <div className="space-y-2">
          <Label htmlFor="p-username">{t('auth.username')}</Label>
          <Input id="p-username" value={`@${initial.username}`} readOnly className="opacity-80" />
          <p className="text-muted-foreground text-xs">{t('auth.usernameLocked')}</p>
        </div>
        <div className="space-y-2">
          <Label htmlFor="p-email">{t('auth.email')}</Label>
          <Input id="p-email" value={initial.email} readOnly className="opacity-80" />
          <p className="text-muted-foreground text-xs">
            {initial.emailVerified ? t('acc.ov.verified') : t('acc.ov.unverified')}
          </p>
        </div>
        <div className="space-y-2">
          <Label htmlFor="p-name">{t('auth.displayName')}</Label>
          <Input
            id="p-name"
            required
            maxLength={60}
            value={displayName}
            onChange={(e) => setDisplayName(e.target.value)}
          />
        </div>
        <div className="space-y-2">
          <Label htmlFor="p-locale">{t('common.language')}</Label>
          <select
            id="p-locale"
            className="border-border bg-surface text-foreground focus:border-primary h-10 w-full rounded-lg border px-3 text-sm outline-none"
            value={profileLanguage}
            onChange={(e) => setProfileLanguage(e.target.value as Language)}
          >
            <option value="en">English</option>
            <option value="vi">Tiếng Việt</option>
          </select>
        </div>
      </div>

      {error ? (
        <p className="text-destructive text-sm" role="alert">
          {error}
        </p>
      ) : null}

      <div className="flex items-center gap-3">
        <Button type="submit" disabled={pending}>
          {pending ? <Loader2 className="h-4 w-4 animate-spin" /> : t('common.save')}
        </Button>
        {saved ? <span className="text-success text-sm">{t('common.saved')}</span> : null}
      </div>
    </form>
  );
}

export function ProfilePage() {
  const { t } = useI18n();
  const me = useMe();
  const [copied, setCopied] = useState(false);

  if (me.isPending || !me.data) {
    return <div className="text-muted-foreground text-sm">{t('common.loading')}</div>;
  }

  const { user } = me.data;

  async function copyReferral() {
    try {
      await navigator.clipboard.writeText(user.referralCode);
      setCopied(true);
      setTimeout(() => setCopied(false), 1500);
    } catch {
      /* clipboard may be unavailable — the code is visible on screen anyway */
    }
  }

  return (
    <div className="space-y-6">
      <div>
        <h1 className="font-heading text-foreground text-2xl font-bold tracking-tight">
          {t('acc.profile')}
        </h1>
        <p className="text-muted-foreground mt-1 text-sm">{t('acc.profile.subtitle')}</p>
      </div>

      <Card>
        <CardHeader>
          <CardTitle>{t('acc.profile.basics')}</CardTitle>
          <CardDescription>{t('acc.profile.basicsDesc')}</CardDescription>
        </CardHeader>
        <CardContent>
          <BasicsForm key={user.id} initial={user} />
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>{t('acc.profile.referral')}</CardTitle>
          <CardDescription>{t('acc.profile.referralDesc')}</CardDescription>
        </CardHeader>
        <CardContent className="flex flex-wrap items-center gap-3">
          <code className="border-border bg-accent/50 text-foreground rounded-lg border px-3 py-1.5 font-mono text-sm font-semibold tracking-wider">
            {user.referralCode}
          </code>
          <Button type="button" size="sm" variant="outline" onClick={copyReferral}>
            {copied ? <Check className="h-4 w-4" /> : <Copy className="h-4 w-4" />}
            {copied ? t('common.copied') : t('common.copy')}
          </Button>
          <span className="text-muted-foreground text-xs">{t('acc.referrals.pending')}</span>
        </CardContent>
      </Card>

      <Separator />
      <p className="text-muted-foreground text-xs">
        {t('acc.profile.planRow', { plan: user.planId })}
      </p>
    </div>
  );
}
