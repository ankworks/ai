import { Card, Badge, useI18n } from '@conai/ui';
import { useQuery } from '@tanstack/react-query';
import { adminFetch } from '../lib/api';
import type { AdminAuditPage } from '../lib/types';

function formatTime(iso: string): string {
  const d = new Date(iso);
  return Number.isNaN(d.getTime()) ? iso : d.toLocaleString();
}

export function AuditPage() {
  const { t } = useI18n();
  const { data, isPending, error } = useQuery({
    queryKey: ['admin-audit'],
    queryFn: () => adminFetch<AdminAuditPage>('/audit?limit=50'),
  });

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold">{t('admin.audit.title')}</h1>
        <p className="text-muted-foreground mt-1 text-sm">{t('admin.audit.subtitle')}</p>
      </div>

      <Card>
        {isPending ? (
          <p className="text-muted-foreground p-5 text-sm">{t('common.loading')}</p>
        ) : error ? (
          <p className="text-destructive p-5 text-sm">{t('common.error.title')}</p>
        ) : data?.events.length === 0 ? (
          <p className="text-muted-foreground p-5 text-center text-sm">{t('admin.audit.empty')}</p>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="text-muted-foreground border-border border-b text-left text-xs tracking-wide uppercase">
                  <th className="px-5 py-3 font-medium">{t('admin.audit.time')}</th>
                  <th className="px-5 py-3 font-medium">{t('admin.audit.action')}</th>
                  <th className="px-5 py-3 font-medium">{t('admin.audit.actor')}</th>
                  <th className="px-5 py-3 font-medium">{t('admin.audit.target')}</th>
                </tr>
              </thead>
              <tbody>
                {data?.events.map((event) => (
                  <tr key={event.id} className="border-border border-b last:border-0">
                    <td className="text-muted-foreground px-5 py-3 whitespace-nowrap tabular-nums">
                      {formatTime(event.created_at)}
                    </td>
                    <td className="px-5 py-3">
                      <Badge variant="indigo">{event.action}</Badge>
                    </td>
                    <td className="px-5 py-3">{event.actor_name ?? event.actor_id}</td>
                    <td className="text-muted-foreground px-5 py-3">
                      {event.target_type ? `${event.target_type}:${event.target_id ?? ''}` : '—'}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </Card>
    </div>
  );
}
