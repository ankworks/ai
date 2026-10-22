import { useState } from 'react';
import { Loader2 } from 'lucide-react';
import { Button, Card, useI18n } from '@conai/ui';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { adminFetch, AdminApiError } from '../lib/api';
import type { AdminSettings } from '../lib/types';

/**
 * Platform settings editor — only the allowlisted keys from SETTING_KEYS are
 * editable (the API rejects everything else). Values are JSON objects.
 */
export function SettingsPage() {
  const { t } = useI18n();
  const queryClient = useQueryClient();
  const [drafts, setDrafts] = useState<Record<string, string>>({});
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [savedKey, setSavedKey] = useState<string | null>(null);

  const { data, isPending, error } = useQuery({
    queryKey: ['admin-settings'],
    queryFn: () => adminFetch<AdminSettings>('/settings'),
  });

  const mutation = useMutation({
    mutationFn: async ({ key, raw }: { key: string; raw: string }) => {
      let value: unknown;
      try {
        value = JSON.parse(raw);
      } catch {
        throw new AdminApiError(400, 'invalid_json', t('admin.settings.invalidJson'));
      }
      if (typeof value !== 'object' || value === null || Array.isArray(value)) {
        throw new AdminApiError(400, 'invalid_json', t('admin.settings.invalidJson'));
      }
      await adminFetch('/settings', { method: 'PUT', body: { key, value } });
    },
    onSuccess: (_data, variables) => {
      setErrors((prev) => {
        const next = { ...prev };
        delete next[variables.key];
        return next;
      });
      setSavedKey(variables.key);
      void queryClient.invalidateQueries({ queryKey: ['admin-settings'] });
    },
    onError: (err, variables) => {
      setErrors((prev) => ({
        ...prev,
        [variables.key]: err instanceof Error ? err.message : t('common.error.title'),
      }));
    },
  });

  if (isPending) return <p className="text-muted-foreground text-sm">{t('common.loading')}</p>;
  if (error || !data) return <p className="text-destructive text-sm">{t('common.error.title')}</p>;

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold">{t('admin.settings.title')}</h1>
        <p className="text-muted-foreground mt-1 text-sm">{t('admin.settings.subtitle')}</p>
      </div>

      <div className="grid gap-4">
        {data.settings.map((row) => {
          const draft = drafts[row.key] ?? JSON.stringify(JSON.parse(row.value), null, 2);
          return (
            <Card key={row.key}>
              <form
                className="space-y-3 p-5"
                onSubmit={(e) => {
                  e.preventDefault();
                  mutation.mutate({ key: row.key, raw: draft });
                }}
              >
                <div className="flex items-center justify-between gap-3">
                  <p className="font-mono text-sm font-medium">{row.key}</p>
                  {savedKey === row.key ? (
                    <span className="text-xs text-emerald-600 dark:text-emerald-400">
                      {t('common.saved')}
                    </span>
                  ) : null}
                </div>
                <textarea
                  className="border-input bg-background ring-offset-background focus-visible:ring-ring min-h-32 w-full rounded-md border p-3 font-mono text-xs focus-visible:ring-2 focus-visible:outline-none"
                  value={draft}
                  onChange={(e) => setDrafts((prev) => ({ ...prev, [row.key]: e.target.value }))}
                  spellCheck={false}
                />
                {errors[row.key] ? (
                  <p className="text-destructive text-sm">{errors[row.key]}</p>
                ) : null}
                <Button type="submit" size="sm" disabled={mutation.isPending}>
                  {mutation.isPending && mutation.variables?.key === row.key ? (
                    <Loader2 className="h-3.5 w-3.5 animate-spin" aria-hidden />
                  ) : null}
                  {t('common.save')}
                </Button>
              </form>
            </Card>
          );
        })}
      </div>
    </div>
  );
}
