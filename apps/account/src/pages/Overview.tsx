import { Link } from 'react-router-dom';
import { useQuery } from '@tanstack/react-query';
import { BadgeCheck, CircleAlert, ExternalLink, Sparkles, UserRound } from 'lucide-react';
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
import { apiFetch, type MeResponse, type PlanDto } from '../lib/api';
import { authClient } from '../lib/auth-client';
import { publicEnv } from '../env';

export function useMe() {
  return useQuery({ queryKey: ['me'], queryFn: () => apiFetch<MeResponse>('/v1/me') });
}

export function OverviewPage() {
  const { t } = useI18n();
  const me = useMe();
  const session = authClient.useSession();
  const plans = useQuery({
    queryKey: ['plans'],
    queryFn: () => apiFetch<{ plans: PlanDto[] }>('/v1/plans'),
    staleTime: 5 * 60_000,
  });

  if (me.isPending) {
    return (
      <div className="space-y-4">
        <Skeleton className="h-24 w-full" />
        <div className="grid gap-4 md:grid-cols-3">
          <Skeleton className="h-36" />
          <Skeleton className="h-36" />
          <Skeleton className="h-36" />
        </div>
      </div>
    );
  }
  if (me.isError || !me.data) {
    return (
      <Card>
        <CardHeader>
          <CardTitle>{t('common.error.title')}</CardTitle>
          <CardDescription>{me.error?.message}</CardDescription>
        </CardHeader>
        <CardContent>
          <Button variant="outline" onClick={() => me.refetch()}>
            {t('common.retry')}
          </Button>
        </CardContent>
      </Card>
    );
  }

  const { user, wallet } = me.data;
  const plan = plans.data?.plans.find((p) => p.id === user.planId);
  const name = session.data?.user.name || user.displayName;

  return (
    <div className="space-y-6">
      <div>
        <h1 className="font-heading text-foreground text-2xl font-bold tracking-tight">
          {t('acc.ov.greeting', { name })}
        </h1>
        <p className="text-muted-foreground mt-1 text-sm">{t('acc.ov.subtitle')}</p>
      </div>

      {!user.emailVerified ? (
        <div className="border-warning/40 bg-warning/10 flex flex-wrap items-center justify-between gap-3 rounded-xl border px-4 py-3">
          <div className="flex items-center gap-2 text-sm">
            <CircleAlert className="text-warning h-4 w-4 shrink-0" aria-hidden />
            <span>{t('acc.ov.verifyWarn')}</span>
          </div>
          <Button
            size="sm"
            variant="outline"
            onClick={() =>
              authClient.sendVerificationEmail({ email: user.email, callbackURL: '/' })
            }
          >
            {t('auth.verifyResendAction')}
          </Button>
        </div>
      ) : null}

      <div className="grid gap-4 md:grid-cols-3">
        <Card>
          <CardHeader className="pb-3">
            <CardDescription className="flex items-center gap-1.5">
              <Sparkles className="h-3.5 w-3.5" aria-hidden />
              {t('acc.ov.sparks')}
            </CardDescription>
            <CardTitle className="text-3xl font-bold tabular-nums">{wallet.balance}</CardTitle>
          </CardHeader>
          <CardContent className="text-muted-foreground space-y-1 text-xs">
            <p>{t('acc.ov.daily', { count: String(wallet.dailyLimit) })}</p>
            <p>
              {t('acc.ov.refill', { time: new Date(wallet.nextRefillAt).toLocaleTimeString() })}
            </p>
            <Link to="/sparks" className="text-primary hover:underline">
              {t('acc.sparks')} →
            </Link>
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="pb-3">
            <CardDescription className="flex items-center gap-1.5">
              <BadgeCheck className="h-3.5 w-3.5" aria-hidden />
              {t('acc.ov.identity')}
            </CardDescription>
            <CardTitle className="text-xl">@{user.username}</CardTitle>
          </CardHeader>
          <CardContent className="text-muted-foreground space-y-1 text-xs">
            <p className="text-foreground">{user.email}</p>
            <p>{user.emailVerified ? t('acc.ov.verified') : t('acc.ov.unverified')}</p>
            <Link to="/profile" className="text-primary hover:underline">
              {t('acc.profile')} →
            </Link>
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="pb-3">
            <CardDescription className="flex items-center gap-1.5">
              <UserRound className="h-3.5 w-3.5" aria-hidden />
              {t('acc.ov.plan')}
            </CardDescription>
            <CardTitle className="text-xl">{plan?.name ?? user.planId}</CardTitle>
          </CardHeader>
          <CardContent className="text-muted-foreground space-y-1 text-xs">
            <p>{plan?.priceLabel ?? 'Free'}</p>
            <Link to="/plans" className="text-primary hover:underline">
              {t('acc.plans')} →
            </Link>
          </CardContent>
        </Card>
      </div>

      <div className="flex flex-wrap gap-3">
        <Link to="/setup">
          <Button variant="outline" size="sm">
            {t('acc.ov.setupCta')}
          </Button>
        </Link>
        <a href={publicEnv.VITE_WORKSPACE_URL}>
          <Button variant="outline" size="sm">
            <ExternalLink className="h-4 w-4" aria-hidden />
            {t('nav.workspace')}
          </Button>
        </a>
      </div>
    </div>
  );
}
