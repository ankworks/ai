/**
 * Prompt Library (Phase 4): user-owned saved prompts — create, edit, copy
 * into the clipboard for use in Chat, delete.
 */

import { useState, type FormEvent } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { Check, ClipboardCopy, Library, Pencil, Plus, Trash2 } from 'lucide-react';
import { Button, Card, CardContent, Input, Skeleton, Textarea, useI18n } from '@conai/ui';
import { apiFetch, ApiError } from '../lib/api';

interface PromptRow {
  id: string;
  title: string;
  body: string;
  created_at: string;
  updated_at: string;
}

export function LibraryPage() {
  const { t } = useI18n();
  const queryClient = useQueryClient();
  const [title, setTitle] = useState('');
  const [body, setBody] = useState('');
  const [editing, setEditing] = useState<PromptRow | null>(null);
  const [copiedId, setCopiedId] = useState<string | null>(null);
  const [formError, setFormError] = useState<string | null>(null);

  const list = useQuery({
    queryKey: ['prompts'],
    queryFn: () => apiFetch<{ prompts: PromptRow[] }>('/v1/ai/prompts'),
    refetchOnWindowFocus: false,
  });

  const invalidate = () => queryClient.invalidateQueries({ queryKey: ['prompts'] });

  const saveMutation = useMutation({
    mutationFn: (vars: { id?: string; title: string; body: string }) =>
      vars.id
        ? apiFetch(`/v1/ai/prompts/${vars.id}`, {
            method: 'PATCH',
            json: { title: vars.title, body: vars.body },
          })
        : apiFetch('/v1/ai/prompts', {
            method: 'POST',
            json: { title: vars.title, body: vars.body },
          }),
    onSuccess: () => {
      setTitle('');
      setBody('');
      setEditing(null);
      setFormError(null);
      void invalidate();
    },
    onError: (err) => {
      setFormError(err instanceof ApiError ? err.message : t('ws.chatErrGeneric'));
    },
  });

  const deleteMutation = useMutation({
    mutationFn: (id: string) => apiFetch(`/v1/ai/prompts/${id}`, { method: 'DELETE' }),
    onSuccess: () => void invalidate(),
  });

  const signedOut = list.error instanceof ApiError && list.error.status === 401;

  const onSubmit = (e: FormEvent) => {
    e.preventDefault();
    const trimmedTitle = title.trim();
    const trimmedBody = body.trim();
    if (!trimmedTitle || !trimmedBody) {
      setFormError(t('ws.libraryRequired'));
      return;
    }
    saveMutation.mutate({
      ...(editing ? { id: editing.id } : {}),
      title: trimmedTitle.slice(0, 80),
      body: trimmedBody.slice(0, 10_000),
    });
  };

  if (signedOut) {
    return (
      <div className="mx-auto w-full max-w-3xl px-4 py-12 md:px-8">
        <Card>
          <CardContent className="p-6 text-sm">
            {t('ws.chatSignInBody')}{' '}
            <a
              href={`${window.location.origin.replace('5174', '5175')}/sign-in`}
              className="text-primary underline underline-offset-2"
            >
              {t('ws.chatSignInCta')}
            </a>
          </CardContent>
        </Card>
      </div>
    );
  }

  return (
    <div className="mx-auto w-full max-w-3xl px-4 py-8 md:px-8 md:py-10">
      <div className="mb-6 flex items-center gap-2.5">
        <span className="bg-primary/10 text-primary flex h-9 w-9 items-center justify-center rounded-lg">
          <Library className="h-4.5 w-4.5" aria-hidden />
        </span>
        <h1 className="text-2xl font-semibold md:text-3xl">{t('ws.library')}</h1>
      </div>

      {/* Create / edit form */}
      <Card className="mb-6">
        <CardContent className="space-y-3 p-4 md:p-5">
          <form onSubmit={onSubmit} className="space-y-3">
            <Input
              value={title}
              onChange={(e) => setTitle(e.target.value)}
              placeholder={t('ws.libraryTitle')}
              maxLength={80}
            />
            <Textarea
              value={body}
              onChange={(e) => setBody(e.target.value)}
              placeholder={t('ws.libraryBody')}
              rows={4}
              maxLength={10_000}
            />
            {formError ? <p className="text-destructive text-xs">{formError}</p> : null}
            <div className="flex items-center gap-2">
              <Button type="submit" size="sm" disabled={saveMutation.isPending}>
                {saveMutation.isPending ? (
                  <span className="mr-1.5 inline-block h-3.5 w-3.5 animate-spin rounded-full border-2 border-current border-t-transparent" />
                ) : (
                  <Plus className="mr-1.5 h-3.5 w-3.5" aria-hidden />
                )}
                {editing ? t('ws.librarySaveChanges') : t('ws.librarySave')}
              </Button>
              {editing ? (
                <Button
                  type="button"
                  variant="ghost"
                  size="sm"
                  onClick={() => {
                    setEditing(null);
                    setTitle('');
                    setBody('');
                    setFormError(null);
                  }}
                >
                  {t('ws.libraryCancel')}
                </Button>
              ) : null}
            </div>
          </form>
        </CardContent>
      </Card>

      {/* List */}
      {list.isPending ? (
        <div className="space-y-3">
          {[0, 1].map((i) => (
            <Skeleton key={i} className="h-24 w-full rounded-xl" />
          ))}
        </div>
      ) : (list.data?.prompts ?? []).length === 0 ? (
        <Card>
          <CardContent className="p-8 text-center text-sm">{t('ws.libraryEmpty')}</CardContent>
        </Card>
      ) : (
        <div className="space-y-3">
          {(list.data?.prompts ?? []).map((p) => (
            <Card key={p.id}>
              <CardContent className="p-4">
                <div className="flex items-start justify-between gap-3">
                  <div className="min-w-0">
                    <div className="truncate text-sm font-medium">{p.title}</div>
                    <p className="text-muted-foreground mt-1 line-clamp-3 text-xs leading-relaxed whitespace-pre-wrap">
                      {p.body}
                    </p>
                  </div>
                  <div className="flex shrink-0 items-center gap-1">
                    <Button
                      variant="ghost"
                      size="sm"
                      className="h-8 w-8 p-0"
                      title={t('ws.libraryCopy')}
                      onClick={() => {
                        void navigator.clipboard.writeText(p.body).then(() => {
                          setCopiedId(p.id);
                          setTimeout(
                            () => setCopiedId((prev) => (prev === p.id ? null : prev)),
                            1500,
                          );
                        });
                      }}
                    >
                      {copiedId === p.id ? (
                        <Check className="text-primary h-4 w-4" aria-hidden />
                      ) : (
                        <ClipboardCopy className="h-4 w-4" aria-hidden />
                      )}
                    </Button>
                    <Button
                      variant="ghost"
                      size="sm"
                      className="h-8 w-8 p-0"
                      title={t('ws.libraryEdit')}
                      onClick={() => {
                        setEditing(p);
                        setTitle(p.title);
                        setBody(p.body);
                        window.scrollTo({ top: 0, behavior: 'smooth' });
                      }}
                    >
                      <Pencil className="h-4 w-4" aria-hidden />
                    </Button>
                    <Button
                      variant="ghost"
                      size="sm"
                      className="text-destructive h-8 w-8 p-0"
                      title={t('ws.libraryDelete')}
                      disabled={deleteMutation.isPending}
                      onClick={() => {
                        if (window.confirm(t('ws.libraryDeleteConfirm'))) {
                          deleteMutation.mutate(p.id);
                        }
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
