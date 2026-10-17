import { useState } from 'react';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { Link2, Link2Off, Loader2, ShieldCheck } from 'lucide-react';
import {
  Button,
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
  Skeleton,
  useI18n,
} from '@conai/ui';
import { apiFetch, type LinkedAccountDto } from '../lib/api';
import { authClient } from '../lib/auth-client';

const PROVIDER_LABELS: Record<string, string> = {
  google: 'Google',
  microsoft: 'Microsoft',
  github: 'GitHub',
  oidc: 'OpenID Connect',
};

export function ConnectedPage() {
  const { t } = useI18n();
  const queryClient = useQueryClient();
  const [busy, setBusy] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  const accounts = useQuery({
    queryKey: ['linked-accounts'],
    queryFn: () => apiFetch<{ accounts: LinkedAccountDto[] }>('/v1/me/accounts'),
  });

  const providers = useQuery({
    queryKey: ['auth-providers'],
    queryFn: () => apiFetch<{ providers: string[] }>('/v1/auth/providers'),
    staleTime: 5 * 60_000,
  });

  async function link(provider: string) {
    setBusy(`link:${provider}`);
    setError(null);
    try {
      const { error: err } = await authClient.linkSocial({
        provider: provider as 'github' | 'google' | 'microsoft',
        callbackURL: `${window.location.origin}${import.meta.env.BASE_URL}connected`,
      });
      if (err) setError(err.message ?? t('auth.err.generic'));
    } finally {
      setBusy(null);
    }
  }

  async function unlink(accountId: string) {
    setBusy(`unlink:${accountId}`);
    setError(null);
    try {
      const { error: err } = await authClient.unlinkAccount({ accountId });
      if (err) setError(err.message ?? t('auth.err.generic'));
      else await queryClient.invalidateQueries({ queryKey: ['linked-accounts'] });
    } finally {
      setBusy(null);
    }
  }

  const linked = accounts.data?.accounts ?? [];
  const enabled = providers.data?.providers ?? [];
  const available = enabled.filter((p) => !linked.some((a) => a.providerId === p));

  return (
    <div className="space-y-6">
      <div>
        <h1 className="font-heading text-foreground text-2xl font-bold tracking-tight">
          {t('acc.connected')}
        </h1>
        <p className="text-muted-foreground mt-1 text-sm">{t('acc.connected.subtitle')}</p>
      </div>

      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <ShieldCheck className="h-4 w-4" aria-hidden />
            {t('acc.connected.linked')}
          </CardTitle>
          <CardDescription>{t('acc.connected.passwordNote')}</CardDescription>
        </CardHeader>
        <CardContent className="space-y-3">
          {accounts.isPending ? <Skeleton className="h-20 w-full" /> : null}

          {linked.map((a) => (
            <div
              key={a.id}
              className="border-border flex flex-wrap items-center justify-between gap-3 rounded-xl border px-4 py-3"
            >
              <div>
                <p className="text-foreground text-sm font-medium">
                  {PROVIDER_LABELS[a.providerId] ?? a.providerId}
                </p>
                <p className="text-muted-foreground text-xs">
                  {a.accountIdMasked} ·{' '}
                  {t('acc.connected.linkedAt', { when: new Date(a.linkedAt).toLocaleDateString() })}
                </p>
              </div>
              <Button
                size="sm"
                variant="outline"
                disabled={busy === `unlink:${a.id}`}
                onClick={() => unlink(a.id)}
              >
                {busy === `unlink:${a.id}` ? (
                  <Loader2 className="h-4 w-4 animate-spin" />
                ) : (
                  <Link2Off className="h-4 w-4" />
                )}
                {t('acc.connected.unlink')}
              </Button>
            </div>
          ))}

          {!accounts.isPending && linked.length === 0 ? (
            <p className="text-muted-foreground text-sm">{t('acc.connected.empty')}</p>
          ) : null}

          {error ? (
            <p className="text-destructive text-sm" role="alert">
              {error}
            </p>
          ) : null}
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <Link2 className="h-4 w-4" aria-hidden />
            {t('acc.connected.addNew')}
          </CardTitle>
          <CardDescription>{t('acc.connected.enabledOnlyNote')}</CardDescription>
        </CardHeader>
        <CardContent className="flex flex-wrap gap-2">
          {available.length === 0 ? (
            <p className="text-muted-foreground text-sm">{t('acc.connected.noAvailable')}</p>
          ) : (
            available.map((p) => (
              <Button
                key={p}
                variant="outline"
                size="sm"
                disabled={busy === `link:${p}`}
                onClick={() => link(p)}
              >
                {busy === `link:${p}` ? (
                  <Loader2 className="h-4 w-4 animate-spin" />
                ) : (
                  <Link2 className="h-4 w-4" />
                )}
                {PROVIDER_LABELS[p] ?? p}
              </Button>
            ))
          )}
        </CardContent>
      </Card>
    </div>
  );
}
