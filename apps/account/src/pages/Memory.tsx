/**
 * Smart Memory (Phase 4, spec §8): opt-in, approve-to-save.
 * - suggested (saved from Chat) → approve/reject before it reaches prompts
 * - approved (manual or approved) → toggle on/off; injected when enabled
 * Only approved + enabled memories are ever sent to the model.
 */

import { useState, type FormEvent } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { Brain, Check, Loader2, Plus, ShieldCheck, Trash2, X } from 'lucide-react';
import { Badge, Button, Card, CardContent, Skeleton, Textarea, useI18n } from '@conai/ui';
import { apiFetch, ApiError } from '../lib/api';

interface MemoryRow {
  id: string;
  content: string;
  status: 'suggested' | 'approved' | 'rejected';
  enabled: number;
  source: 'user' | 'model';
  source_message_id: string | null;
  created_at: string;
  updated_at: string;
}

interface MemoryList {
  memories: MemoryRow[];
  counts: { suggested: number; approved: number; rejected: number };
}

type Tab = 'suggested' | 'approved' | 'rejected';

export function MemoryPage() {
  const { t } = useI18n();
  const queryClient = useQueryClient();
  const [tab, setTab] = useState<Tab>('suggested');
  const [draft, setDraft] = useState('');
  const [formError, setFormError] = useState<string | null>(null);

  const list = useQuery({
    queryKey: ['memories'],
    queryFn: () => apiFetch<MemoryList>('/v1/ai/memory'),
    refetchOnWindowFocus: false,
  });

  const invalidate = () => queryClient.invalidateQueries({ queryKey: ['memories'] });

  const createMutation = useMutation({
    mutationFn: (content: string) =>
      apiFetch('/v1/ai/memory', { method: 'POST', json: { content, source: 'user' } }),
    onSuccess: () => {
      setDraft('');
      setFormError(null);
      setTab('approved');
      void invalidate();
    },
    onError: (err) => setFormError(err instanceof ApiError ? err.message : t('ws.chatErrGeneric')),
  });

  const patchMutation = useMutation({
    mutationFn: (vars: { id: string; patch: Record<string, unknown> }) =>
      apiFetch(`/v1/ai/memory/${vars.id}`, { method: 'PATCH', json: vars.patch }),
    onSuccess: () => void invalidate(),
  });

  const deleteMutation = useMutation({
    mutationFn: (id: string) => apiFetch(`/v1/ai/memory/${id}`, { method: 'DELETE' }),
    onSuccess: () => void invalidate(),
  });

  const deleteAllMutation = useMutation({
    mutationFn: () => apiFetch('/v1/ai/memory', { method: 'DELETE' }),
    onSuccess: () => void invalidate(),
  });

  const signedOut = list.error instanceof ApiError && list.error.status === 401;

  if (signedOut) {
    return (
      <div className="space-y-4">
        <h1 className="text-xl font-semibold">{t('acc.memory')}</h1>
        <Card>
          <CardContent className="p-6 text-sm">{t('ws.chatSignInBody')}</CardContent>
        </Card>
      </div>
    );
  }

  const counts = list.data?.counts ?? { suggested: 0, approved: 0, rejected: 0 };
  const rows = (list.data?.memories ?? []).filter((m) => m.status === tab);

  const tabs: Array<{ id: Tab; label: string; count: number }> = [
    { id: 'suggested', label: t('acc.memTabSuggested'), count: counts.suggested },
    { id: 'approved', label: t('acc.memTabApproved'), count: counts.approved },
    { id: 'rejected', label: t('acc.memTabRejected'), count: counts.rejected },
  ];

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div className="flex items-center gap-2.5">
          <span className="bg-primary/10 text-primary flex h-9 w-9 items-center justify-center rounded-lg">
            <Brain className="h-4.5 w-4.5" aria-hidden />
          </span>
          <h1 className="text-xl font-semibold">{t('acc.memory')}</h1>
        </div>
        {(list.data?.memories ?? []).length > 0 ? (
          <Button
            variant="ghost"
            size="sm"
            className="text-destructive"
            disabled={deleteAllMutation.isPending}
            onClick={() => {
              if (window.confirm(t('acc.memDeleteAllConfirm'))) deleteAllMutation.mutate();
            }}
          >
            <Trash2 className="mr-1.5 h-3.5 w-3.5" aria-hidden />
            {t('acc.memDeleteAll')}
          </Button>
        ) : null}
      </div>

      <p className="text-muted-foreground text-sm leading-relaxed">{t('acc.memIntro')}</p>

      {/* Manual add — saved as approved (the user explicitly added it). */}
      <Card>
        <CardContent className="space-y-3 p-4">
          <form
            onSubmit={(e: FormEvent) => {
              e.preventDefault();
              const content = draft.trim();
              if (!content) return;
              createMutation.mutate(content.slice(0, 2000));
            }}
            className="space-y-2"
          >
            <Textarea
              value={draft}
              onChange={(e) => setDraft(e.target.value)}
              placeholder={t('acc.memAddPlaceholder')}
              rows={2}
              maxLength={2000}
            />
            {formError ? <p className="text-destructive text-xs">{formError}</p> : null}
            <div className="flex items-center justify-between">
              <span className="text-muted-foreground text-xs">{draft.length}/2000</span>
              <Button type="submit" size="sm" disabled={createMutation.isPending || !draft.trim()}>
                {createMutation.isPending ? (
                  <Loader2 className="mr-1.5 h-3.5 w-3.5 animate-spin" aria-hidden />
                ) : (
                  <Plus className="mr-1.5 h-3.5 w-3.5" aria-hidden />
                )}
                {t('acc.memAdd')}
              </Button>
            </div>
          </form>
        </CardContent>
      </Card>

      {/* Tabs */}
      <div className="flex flex-wrap gap-2">
        {tabs.map((tb) => (
          <Button
            key={tb.id}
            variant={tab === tb.id ? 'default' : 'outline'}
            size="sm"
            onClick={() => setTab(tb.id)}
          >
            {tb.label}
            <Badge variant={tab === tb.id ? 'secondary' : 'outline'} className="ml-2 px-1.5">
              {tb.count}
            </Badge>
          </Button>
        ))}
      </div>

      {/* List */}
      {list.isPending ? (
        <div className="space-y-3">
          {[0, 1].map((i) => (
            <Skeleton key={i} className="h-20 w-full rounded-xl" />
          ))}
        </div>
      ) : rows.length === 0 ? (
        <Card>
          <CardContent className="text-muted-foreground p-8 text-center text-sm">
            {tab === 'suggested'
              ? t('acc.memEmptySuggested')
              : tab === 'approved'
                ? t('acc.memEmptyApproved')
                : t('acc.memEmptyRejected')}
          </CardContent>
        </Card>
      ) : (
        <div className="space-y-3">
          {rows.map((m) => (
            <Card key={m.id}>
              <CardContent className="p-4">
                <div className="flex items-start justify-between gap-3">
                  <div className="min-w-0 flex-1">
                    <p className="text-sm leading-relaxed break-words whitespace-pre-wrap">
                      {m.content}
                    </p>
                    <div className="text-muted-foreground mt-2 flex flex-wrap items-center gap-2 text-xs">
                      <Badge variant="outline">
                        {m.source === 'user' ? t('acc.memSourceUser') : t('acc.memSourceModel')}
                      </Badge>
                      {m.status === 'approved' ? (
                        <label className="flex cursor-pointer items-center gap-1.5">
                          <input
                            type="checkbox"
                            checked={m.enabled === 1}
                            onChange={(e) =>
                              patchMutation.mutate({
                                id: m.id,
                                patch: { enabled: e.target.checked },
                              })
                            }
                            className="accent-primary h-3.5 w-3.5"
                          />
                          {m.enabled === 1 ? t('acc.memEnabled') : t('acc.memDisabled')}
                        </label>
                      ) : (
                        <span>{new Date(m.updated_at).toLocaleString()}</span>
                      )}
                    </div>
                  </div>
                  <div className="flex shrink-0 items-center gap-1">
                    {m.status === 'suggested' ? (
                      <>
                        <Button
                          variant="outline"
                          size="sm"
                          className="h-8"
                          disabled={patchMutation.isPending}
                          onClick={() =>
                            patchMutation.mutate({ id: m.id, patch: { status: 'approved' } })
                          }
                        >
                          <Check className="mr-1 h-3.5 w-3.5" aria-hidden />
                          {t('acc.memApprove')}
                        </Button>
                        <Button
                          variant="ghost"
                          size="sm"
                          className="h-8"
                          disabled={patchMutation.isPending}
                          onClick={() =>
                            patchMutation.mutate({ id: m.id, patch: { status: 'rejected' } })
                          }
                        >
                          <X className="mr-1 h-3.5 w-3.5" aria-hidden />
                          {t('acc.memReject')}
                        </Button>
                      </>
                    ) : null}
                    {m.status === 'rejected' ? (
                      <Button
                        variant="outline"
                        size="sm"
                        className="h-8"
                        onClick={() =>
                          patchMutation.mutate({ id: m.id, patch: { status: 'approved' } })
                        }
                      >
                        <ShieldCheck className="mr-1 h-3.5 w-3.5" aria-hidden />
                        {t('acc.memApprove')}
                      </Button>
                    ) : null}
                    <Button
                      variant="ghost"
                      size="sm"
                      className="text-destructive h-8 w-8 p-0"
                      disabled={deleteMutation.isPending}
                      onClick={() => {
                        if (window.confirm(t('acc.memDeleteConfirm'))) deleteMutation.mutate(m.id);
                      }}
                    >
                      <Trash2 className="h-4 w-4" aria-hidden />
                    </Button>
                  </div>
                </div>
              </CardContent>
            </Card>
          ))}
        </div>
      )}
    </div>
  );
}
