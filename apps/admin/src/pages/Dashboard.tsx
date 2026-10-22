import {
  BarChart3,
  FileText,
  Gauge,
  MessagesSquare,
  ShieldCheck,
  Sparkles,
  Users,
  UsersRound,
  FolderOpen,
  LifeBuoy,
} from 'lucide-react';
import type { LucideIcon } from 'lucide-react';
import { Card, CardContent, Skeleton, useI18n, type I18nKey } from '@conai/ui';
import { useQuery } from '@tanstack/react-query';
import { adminFetch } from '../lib/api';
import type { DashboardCounts } from '../lib/types';

export function DashboardPage() {
  const { t } = useI18n();
  const { data, isPending, error } = useQuery({
    queryKey: ['admin-dashboard'],
    queryFn: () => adminFetch<DashboardCounts>('/dashboard'),
  });

  if (isPending) {
    return (
      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
        {Array.from({ length: 9 }).map((_, i) => (
          <Skeleton key={i} className="h-28 w-full" />
        ))}
      </div>
    );
  }

  if (error || !data) {
    return <p className="text-destructive text-sm">{t('common.error.title')}</p>;
  }

  const items: Array<{
    key: keyof DashboardCounts['counts'];
    labelKey: I18nKey;
    icon: LucideIcon;
  }> = [
    { key: 'users', labelKey: 'admin.dashboard.users', icon: Users },
    { key: 'bannedUsers', labelKey: 'admin.dashboard.bannedUsers', icon: UsersRound },
    { key: 'teams', labelKey: 'admin.dashboard.teams', icon: MessagesSquare },
    { key: 'files', labelKey: 'admin.dashboard.files', icon: FolderOpen },
    { key: 'conversations', labelKey: 'admin.dashboard.conversations', icon: Gauge },
    { key: 'messages', labelKey: 'admin.dashboard.messages', icon: FileText },
    { key: 'sparksInCirculation', labelKey: 'admin.dashboard.sparks', icon: Sparkles },
    { key: 'admins', labelKey: 'admin.dashboard.admins', icon: ShieldCheck },
    { key: 'auditEventsLast24h', labelKey: 'admin.dashboard.audit24h', icon: LifeBuoy },
  ];

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold">{t('admin.dashboard.title')}</h1>
        <p className="text-muted-foreground mt-1 text-sm">{t('admin.dashboard.subtitle')}</p>
      </div>
      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
        {items.map((item) => (
          <Card key={item.key}>
            <CardContent className="flex items-center gap-4 p-5">
              <div className="bg-primary/10 flex h-11 w-11 shrink-0 items-center justify-center rounded-lg">
                <item.icon className="text-primary h-5 w-5" aria-hidden />
              </div>
              <div className="min-w-0">
                <p className="text-muted-foreground truncate text-xs font-medium tracking-wide uppercase">
                  {t(item.labelKey)}
                </p>
                <p className="text-foreground mt-0.5 text-2xl font-bold tabular-nums">
                  {data.counts[item.key].toLocaleString()}
                </p>
              </div>
            </CardContent>
          </Card>
        ))}
      </div>
      <p className="text-muted-foreground flex items-center gap-1.5 text-xs">
        <BarChart3 className="h-3.5 w-3.5" aria-hidden />
        {t('admin.dashboard.subtitle')}
      </p>
    </div>
  );
}
