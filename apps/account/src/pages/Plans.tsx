import { useQuery } from '@tanstack/react-query';
import { BadgeCheck, GraduationCap, Sparkles } from 'lucide-react';
import {
  Badge,
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
  Skeleton,
  useI18n,
} from '@conai/ui';
import { apiFetch, type PlanDto } from '../lib/api';
import { useMe } from './Overview';

function formatStorage(mb: number | null): string | null {
  if (mb === null) return null;
  if (mb >= 1024) return `${(mb / 1024).toFixed(mb % 1024 === 0 ? 0 : 1)} GB`;
  return `${mb} MB`;
}

export function PlansPage() {
  const { t } = useI18n();
  const me = useMe();
  const plans = useQuery({
    queryKey: ['plans'],
    queryFn: () => apiFetch<{ plans: PlanDto[] }>('/v1/plans'),
    staleTime: 5 * 60_000,
  });

  if (plans.isPending) {
    return (
      <div className="grid gap-4 md:grid-cols-2">
        <Skeleton className="h-56" />
        <Skeleton className="h-56" />
        <Skeleton className="h-56" />
        <Skeleton className="h-56" />
      </div>
    );
  }

  const currentPlanId = me.data?.user.planId;

  return (
    <div className="space-y-6">
      <div>
        <h1 className="font-heading text-foreground text-2xl font-bold tracking-tight">
          {t('acc.plans')}
        </h1>
        <p className="text-muted-foreground mt-1 text-sm">{t('acc.plans.subtitle')}</p>
      </div>

      <div className="grid gap-4 md:grid-cols-2">
        {plans.data?.plans.map((plan) => {
          const isCurrent = plan.id === currentPlanId;
          const personal = formatStorage(plan.personalStorageMb);
          const team = formatStorage(plan.teamStorageMb);
          return (
            <Card key={plan.id} className={isCurrent ? 'border-primary' : undefined}>
              <CardHeader>
                <div className="flex items-center justify-between gap-2">
                  <CardTitle className="text-lg">{plan.name}</CardTitle>
                  <div className="flex items-center gap-1.5">
                    {plan.requiresVerification ? (
                      <Badge variant="warning" className="gap-1">
                        <GraduationCap className="h-3 w-3" aria-hidden />
                        {t('acc.plans.verification')}
                      </Badge>
                    ) : null}
                    {isCurrent ? (
                      <Badge variant="success" className="gap-1">
                        <BadgeCheck className="h-3 w-3" aria-hidden />
                        {t('acc.plans.current')}
                      </Badge>
                    ) : null}
                  </div>
                </div>
                <CardDescription>{plan.priceLabel}</CardDescription>
              </CardHeader>
              <CardContent className="text-muted-foreground space-y-2 text-sm">
                {plan.dailySparks !== null ? (
                  <p className="text-foreground flex items-center gap-1.5 font-medium tabular-nums">
                    <Sparkles className="text-primary h-4 w-4" aria-hidden />
                    {t('acc.plans.dailySparks', { count: String(plan.dailySparks) })}
                  </p>
                ) : null}
                {personal ? <p>{t('acc.plans.personalStorage', { size: personal })}</p> : null}
                {team ? <p>{t('acc.plans.teamStorage', { size: team })}</p> : null}
                {plan.maxTeamMembers !== null ? (
                  <p>{t('acc.plans.maxMembers', { count: String(plan.maxTeamMembers) })}</p>
                ) : null}
                {plan.maxTeamsPerAccount !== null ? (
                  <p>{t('acc.plans.maxTeams', { count: String(plan.maxTeamsPerAccount) })}</p>
                ) : null}
                {plan.requiresVerification ? (
                  <p className="text-xs italic">{t('acc.plans.studentNote')}</p>
                ) : null}
              </CardContent>
            </Card>
          );
        })}
      </div>

      <p className="text-muted-foreground text-xs leading-relaxed">{t('acc.plans.upgradeNote')}</p>
    </div>
  );
}
