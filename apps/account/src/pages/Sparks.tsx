import { Sparkles, TimerReset, Wallet } from 'lucide-react';
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
  Skeleton,
  useI18n,
} from '@conai/ui';
import { useMe } from './Overview';

/**
 * Sparks wallet snapshot. Balance + limits are real (D1 wallet + plan config);
 * the transaction ledger and metered usage charts arrive with the AI Gateway (Phase 3).
 */
export function SparksPage() {
  const { t, language } = useI18n();
  const me = useMe();

  if (me.isPending) {
    return (
      <div className="grid gap-4 md:grid-cols-2">
        <Skeleton className="h-40" />
        <Skeleton className="h-40" />
      </div>
    );
  }
  if (me.isError || !me.data) {
    return <p className="text-destructive text-sm">{me.error?.message}</p>;
  }

  const { wallet } = me.data;
  const refill = new Date(wallet.nextRefillAt).toLocaleString(
    language === 'vi' ? 'vi-VN' : 'en-US',
    { dateStyle: 'medium', timeStyle: 'short', timeZone: 'UTC' },
  );

  return (
    <div className="space-y-6">
      <div>
        <h1 className="font-heading text-foreground text-2xl font-bold tracking-tight">
          {t('acc.sparks')}
        </h1>
        <p className="text-muted-foreground mt-1 text-sm">{t('acc.sparks.subtitle')}</p>
      </div>

      <div className="grid gap-4 md:grid-cols-2">
        <Card>
          <CardHeader>
            <CardDescription className="flex items-center gap-1.5">
              <Wallet className="h-3.5 w-3.5" aria-hidden />
              {t('acc.sparks.balance')}
            </CardDescription>
            <CardTitle className="text-4xl font-bold tabular-nums">{wallet.balance}</CardTitle>
          </CardHeader>
          <CardContent className="text-muted-foreground text-xs">
            {t('acc.sparks.balanceDesc')}
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardDescription className="flex items-center gap-1.5">
              <TimerReset className="h-3.5 w-3.5" aria-hidden />
              {t('acc.sparks.refillTitle')}
            </CardDescription>
            <CardTitle className="text-xl tabular-nums">
              +{wallet.dailyLimit}{' '}
              <span className="text-muted-foreground text-sm font-normal">
                {t('acc.sparks.atMidnight')}
              </span>
            </CardTitle>
          </CardHeader>
          <CardContent className="text-muted-foreground space-y-1 text-xs">
            <p>{t('acc.sparks.refillRule')}</p>
            <p>{t('acc.sparks.nextRefill', { when: refill })}</p>
          </CardContent>
        </Card>
      </div>

      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2 text-base">
            <Sparkles className="text-primary h-4 w-4" aria-hidden />
            {t('acc.sparks.howTitle')}
          </CardTitle>
        </CardHeader>
        <CardContent className="text-muted-foreground space-y-2 text-sm leading-relaxed">
          <p>{t('acc.sparks.howBody')}</p>
          <p className="text-xs italic">{t('acc.sparks.ledgerNote')}</p>
        </CardContent>
      </Card>
    </div>
  );
}
