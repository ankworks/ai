import { useState } from 'react';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { MonitorSmartphone, ShieldCheck, Trash2, Loader2 } from 'lucide-react';
import {
  Badge,
  Button,
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
  Skeleton,
  useI18n,
} from '@conai/ui';
import { apiFetch, type SessionDto } from '../lib/api';

function formatWhen(iso: string, locale: string): string {
  try {
    return new Date(iso).toLocaleString(locale === 'vi' ? 'vi-VN' : 'en-US', {
      dateStyle: 'medium',
      timeStyle: 'short',
    });
  } catch {
    return iso;
  }
}

export function DevicesPage() {
  const { t, language } = useI18n();
  const queryClient = useQueryClient();
  const [revoking, setRevoking] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  const sessions = useQuery({
    queryKey: ['sessions'],
    queryFn: () => apiFetch<{ sessions: SessionDto[] }>('/v1/me/sessions'),
  });

  async function revoke(id: string) {
    setRevoking(id);
    setError(null);
    try {
      await apiFetch(`/v1/me/sessions/${id}`, { method: 'DELETE' });
      await queryClient.invalidateQueries({ queryKey: ['sessions'] });
    } catch (err) {
      setError(err instanceof Error ? err.message : t('auth.err.generic'));
    } finally {
      setRevoking(null);
    }
  }

  return (
    <div className="space-y-6">
      <div>
        <h1 className="font-heading text-foreground text-2xl font-bold tracking-tight">
          {t('acc.devices')}
        </h1>
        <p className="text-muted-foreground mt-1 text-sm">{t('acc.devices.subtitle')}</p>
      </div>

      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <MonitorSmartphone className="h-4 w-4" aria-hidden />
            {t('acc.devices.activeSessions')}
          </CardTitle>
          <CardDescription>{t('acc.devices.sessionsDesc')}</CardDescription>
        </CardHeader>
        <CardContent className="space-y-3">
          {sessions.isPending ? <Skeleton className="h-24 w-full" /> : null}

          {sessions.isError ? (
            <div className="space-y-2">
              <p className="text-destructive text-sm">{sessions.error?.message}</p>
              <Button size="sm" variant="outline" onClick={() => sessions.refetch()}>
                {t('common.retry')}
              </Button>
            </div>
          ) : null}

          {error ? (
            <p className="text-destructive text-sm" role="alert">
              {error}
            </p>
          ) : null}

          {sessions.data?.sessions.map((s) => (
            <div
              key={s.id}
              className="border-border flex flex-wrap items-center justify-between gap-3 rounded-xl border px-4 py-3"
            >
              <div className="min-w-0 space-y-1">
                <div className="flex items-center gap-2">
                  <span className="text-foreground truncate text-sm font-medium">
                    {s.userAgent ?? t('acc.devices.unknownAgent')}
                  </span>
                  {s.isCurrent ? (
                    <Badge variant="success" className="gap-1">
                      <ShieldCheck className="h-3 w-3" aria-hidden />
                      {t('acc.devices.current')}
                    </Badge>
                  ) : null}
                </div>
                <p className="text-muted-foreground text-xs">
                  {t('acc.devices.signedInAt', { when: formatWhen(s.createdAt, language) })}
                  {s.ipAddress ? ` · ${s.ipAddress}` : ''}
                </p>
              </div>
              <Button
                size="sm"
                variant="outline"
                disabled={revoking === s.id}
                onClick={() => revoke(s.id)}
              >
                {revoking === s.id ? (
                  <Loader2 className="h-4 w-4 animate-spin" />
                ) : (
                  <Trash2 className="h-4 w-4" />
                )}
                {t('acc.devices.revoke')}
              </Button>
            </div>
          ))}

          {sessions.data && sessions.data.sessions.length === 0 ? (
            <p className="text-muted-foreground text-sm">{t('acc.devices.empty')}</p>
          ) : null}
        </CardContent>
      </Card>

      <p className="text-muted-foreground text-xs leading-relaxed">
        {t('acc.devices.privacyNote')}
      </p>
    </div>
  );
}
