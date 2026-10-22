import { useState, type FormEvent } from 'react';
import { Loader2, ShieldCheck, Trash2 } from 'lucide-react';
import { Badge, Button, Card, Input, Label, useI18n } from '@conai/ui';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { adminFetch, AdminApiError } from '../lib/api';
import type { AdminRosterRow } from '../lib/types';

const ROLES = [
  'owner',
  'administrator',
  'moderator',
  'student_reviewer',
  'ai_manager',
  'support_agent',
] as const;

export function AdminsPage() {
  const { t } = useI18n();
  const queryClient = useQueryClient();
  const [email, setEmail] = useState('');
  const [role, setRole] = useState<(typeof ROLES)[number]>('moderator');
  const [formError, setFormError] = useState<string | null>(null);

  const { data, isPending, error } = useQuery({
    queryKey: ['admin-admins'],
    queryFn: () => adminFetch<{ admins: AdminRosterRow[] }>('/admins'),
  });

  const invalidate = () => queryClient.invalidateQueries({ queryKey: ['admin-admins'] });

  const grant = useMutation({
    mutationFn: () =>
      adminFetch('/admins', { method: 'POST', body: { email: email.trim(), role } }),
    onSuccess: () => {
      setFormError(null);
      setEmail('');
      void invalidate();
    },
    onError: (err) => {
      setFormError(
        err instanceof AdminApiError && err.code === 'not_found'
          ? t('admin.admins.unknownUser')
          : err instanceof Error
            ? err.message
            : t('common.error.title'),
      );
    },
  });

  const revoke = useMutation({
    mutationFn: (userId: string) => {
      if (!window.confirm(t('admin.admins.revokeConfirm'))) return Promise.resolve();
      return adminFetch(`/admins/${userId}`, { method: 'DELETE' });
    },
    onSuccess: () => void invalidate(),
  });

  function onGrant(e: FormEvent) {
    e.preventDefault();
    grant.mutate();
  }

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold">{t('admin.admins.title')}</h1>
        <p className="text-muted-foreground mt-1 text-sm">{t('admin.admins.subtitle')}</p>
      </div>

      <Card>
        <form onSubmit={onGrant} className="space-y-4 p-5">
          <div className="grid gap-4 md:grid-cols-[1fr,200px,auto] md:items-end">
            <div className="space-y-1.5">
              <Label htmlFor="grant-email">{t('admin.admins.email')}</Label>
              <Input
                id="grant-email"
                type="email"
                required
                value={email}
                onChange={(e) => setEmail(e.target.value)}
              />
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="grant-role">{t('admin.admins.role')}</Label>
              <select
                id="grant-role"
                value={role}
                onChange={(e) => setRole(e.target.value as (typeof ROLES)[number])}
                className="border-input bg-background ring-offset-background focus-visible:ring-ring flex h-10 w-full rounded-md border px-3 py-2 text-sm focus-visible:ring-2 focus-visible:outline-none"
              >
                {ROLES.map((r) => (
                  <option key={r} value={r}>
                    {t(`admin.role.${r}` as Parameters<typeof t>[0])}
                  </option>
                ))}
              </select>
            </div>
            <Button type="submit" disabled={grant.isPending}>
              {grant.isPending ? <Loader2 className="h-4 w-4 animate-spin" aria-hidden /> : null}
              {t('admin.admins.grant')}
            </Button>
          </div>
          {formError ? <p className="text-destructive text-sm">{formError}</p> : null}
        </form>
      </Card>

      <Card>
        {isPending ? (
          <p className="text-muted-foreground p-5 text-sm">{t('common.loading')}</p>
        ) : error ? (
          <p className="text-destructive p-5 text-sm">{t('common.error.title')}</p>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="text-muted-foreground border-border border-b text-left text-xs tracking-wide uppercase">
                  <th className="px-5 py-3 font-medium">{t('admin.admins.email')}</th>
                  <th className="px-5 py-3 font-medium">{t('admin.admins.role')}</th>
                  <th className="px-5 py-3 font-medium">{t('admin.admins.mfa')}</th>
                  <th className="px-5 py-3 font-medium">{t('admin.admins.status')}</th>
                  <th className="px-5 py-3 text-right font-medium">{t('admin.users.actions')}</th>
                </tr>
              </thead>
              <tbody>
                {data?.admins.map((admin) => (
                  <tr key={admin.user_id} className="border-border border-b last:border-0">
                    <td className="px-5 py-3 font-medium">{admin.email}</td>
                    <td className="px-5 py-3">
                      {t(`admin.role.${admin.role}` as Parameters<typeof t>[0])}
                    </td>
                    <td className="px-5 py-3">
                      {admin.twoFactorEnabled === 1 ? (
                        <ShieldCheck className="h-4 w-4 text-emerald-500" aria-hidden />
                      ) : (
                        <span className="text-muted-foreground text-xs">—</span>
                      )}
                    </td>
                    <td className="px-5 py-3">
                      {admin.status === 'active' ? (
                        <Badge variant="secondary">{t('admin.users.active')}</Badge>
                      ) : (
                        <Badge variant="destructive">{t('admin.users.locked')}</Badge>
                      )}
                    </td>
                    <td className="px-5 py-3 text-right">
                      <Button
                        size="sm"
                        variant="ghost"
                        disabled={revoke.isPending}
                        onClick={() => revoke.mutate(admin.user_id)}
                      >
                        <Trash2 className="text-destructive h-3.5 w-3.5" aria-hidden />
                        <span className="ml-1.5">{t('admin.admins.revoke')}</span>
                      </Button>
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
