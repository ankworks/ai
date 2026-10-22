import { useState } from 'react';
import { Loader2, Lock, Unlock } from 'lucide-react';
import { Badge, Button, Card, Input, Skeleton, useI18n } from '@conai/ui';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { adminFetch, AdminApiError } from '../lib/api';
import type { AdminUserList, AdminUserRow } from '../lib/types';

export function UsersPage() {
  const { t } = useI18n();
  const queryClient = useQueryClient();
  const [q, setQ] = useState('');
  const [search, setSearch] = useState('');
  const [actionError, setActionError] = useState<string | null>(null);

  const { data, isPending, error } = useQuery({
    queryKey: ['admin-users', search],
    queryFn: () =>
      adminFetch<AdminUserList>(`/users${search ? `?q=${encodeURIComponent(search)}` : ''}`),
  });

  const mutation = useMutation({
    mutationFn: async ({ user, lock }: { user: AdminUserRow; lock: boolean }) => {
      if (lock && !window.confirm(t('admin.users.lockConfirm'))) return;
      await adminFetch(`/users/${user.id}/${lock ? 'lock' : 'unlock'}`, {
        method: 'POST',
        body: {},
      });
    },
    onSuccess: () => {
      setActionError(null);
      void queryClient.invalidateQueries({ queryKey: ['admin-users'] });
    },
    onError: (err) => {
      setActionError(err instanceof AdminApiError ? err.message : t('common.error.title'));
    },
  });

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold">{t('admin.users.title')}</h1>
        <p className="text-muted-foreground mt-1 text-sm">{t('admin.users.subtitle')}</p>
      </div>

      <form
        onSubmit={(e) => {
          e.preventDefault();
          setSearch(q.trim());
        }}
        className="flex gap-2"
      >
        <Input
          value={q}
          onChange={(e) => setQ(e.target.value)}
          placeholder={t('admin.users.search')}
          className="max-w-sm"
        />
        <Button type="submit">{t('admin.users.search')}</Button>
      </form>

      {actionError ? <p className="text-destructive text-sm">{actionError}</p> : null}

      <Card>
        {isPending ? (
          <div className="space-y-3 p-5">
            {Array.from({ length: 5 }).map((_, i) => (
              <Skeleton key={i} className="h-10 w-full" />
            ))}
          </div>
        ) : error ? (
          <p className="text-destructive p-5 text-sm">{t('common.error.title')}</p>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="text-muted-foreground border-border border-b text-left text-xs tracking-wide uppercase">
                  <th className="px-5 py-3 font-medium">{t('admin.users.email')}</th>
                  <th className="px-5 py-3 font-medium">{t('admin.users.name')}</th>
                  <th className="px-5 py-3 font-medium">{t('admin.users.plan')}</th>
                  <th className="px-5 py-3 font-medium">{t('admin.users.status')}</th>
                  <th className="px-5 py-3 text-right font-medium">{t('admin.users.actions')}</th>
                </tr>
              </thead>
              <tbody>
                {data?.users.length === 0 ? (
                  <tr>
                    <td colSpan={5} className="text-muted-foreground px-5 py-8 text-center">
                      {t('admin.users.empty')}
                    </td>
                  </tr>
                ) : (
                  data?.users.map((user) => (
                    <tr key={user.id} className="border-border border-b last:border-0">
                      <td className="px-5 py-3">
                        <span className="font-medium">{user.email}</span>
                        {user.is_admin === 1 ? (
                          <Badge variant="indigo" className="ml-2">
                            {t('admin.users.adminBadge')}
                          </Badge>
                        ) : null}
                      </td>
                      <td className="text-muted-foreground px-5 py-3">
                        {user.display_name ?? user.name}
                      </td>
                      <td className="text-muted-foreground px-5 py-3">{user.plan_id ?? '—'}</td>
                      <td className="px-5 py-3">
                        {user.banned === 1 ? (
                          <Badge variant="destructive">{t('admin.users.locked')}</Badge>
                        ) : (
                          <Badge variant="secondary">{t('admin.users.active')}</Badge>
                        )}
                      </td>
                      <td className="px-5 py-3 text-right">
                        <Button
                          size="sm"
                          variant={user.banned === 1 ? 'secondary' : 'destructive'}
                          disabled={mutation.isPending}
                          onClick={() => mutation.mutate({ user, lock: user.banned !== 1 })}
                        >
                          {mutation.isPending ? (
                            <Loader2 className="h-3.5 w-3.5 animate-spin" aria-hidden />
                          ) : user.banned === 1 ? (
                            <Unlock className="h-3.5 w-3.5" aria-hidden />
                          ) : (
                            <Lock className="h-3.5 w-3.5" aria-hidden />
                          )}
                          <span className="ml-1.5">
                            {user.banned === 1 ? t('admin.users.unlock') : t('admin.users.lock')}
                          </span>
                        </Button>
                      </td>
                    </tr>
                  ))
                )}
              </tbody>
            </table>
          </div>
        )}
      </Card>
    </div>
  );
}
