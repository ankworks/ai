/**
 * Chat History (Phase 4): server-stored conversations — search, pin, rename,
 * delete, and open a thread in Chat (/chat?c=<id>).
 */

import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { History, MessageSquareText, Pencil, Pin, PinOff, Search, Trash2 } from 'lucide-react';
import { Button, Card, CardContent, Input, Skeleton, useI18n, type I18nKey } from '@conai/ui';
import { apiFetch, ApiError } from '../lib/api';

interface ConversationRow {
  id: string;
  title: string;
  tool: string | null;
  model: string | null;
  pinned: number;
  message_count: number;
  last_message_at: string | null;
  created_at: string;
  updated_at: string;
}

interface ConversationList {
  conversations: ConversationRow[];
}

export function HistoryPage() {
  const { t } = useI18n();
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const [q, setQ] = useState('');
  const [editingId, setEditingId] = useState<string | null>(null);
  const [editTitle, setEditTitle] = useState('');

  const list = useQuery({
    queryKey: ['conversations', q],
    queryFn: () =>
      apiFetch<ConversationList>(`/v1/ai/conversations${q ? `?q=${encodeURIComponent(q)}` : ''}`),
    refetchOnWindowFocus: false,
  });

  const invalidate = () => queryClient.invalidateQueries({ queryKey: ['conversations'] });

  const pinMutation = useMutation({
    mutationFn: ({ id, pinned }: { id: string; pinned: boolean }) =>
      apiFetch(`/v1/ai/conversations/${id}`, {
        method: 'PATCH',
        json: { pinned },
      }),
    onSuccess: () => void invalidate(),
  });

  const renameMutation = useMutation({
    mutationFn: ({ id, title }: { id: string; title: string }) =>
      apiFetch(`/v1/ai/conversations/${id}`, {
        method: 'PATCH',
        json: { title },
      }),
    onSuccess: () => {
      setEditingId(null);
      void invalidate();
    },
  });

  const deleteMutation = useMutation({
    mutationFn: (id: string) => apiFetch(`/v1/ai/conversations/${id}`, { method: 'DELETE' }),
    onSuccess: () => void invalidate(),
  });

  const signedOut = list.error instanceof ApiError && list.error.status === 401;

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
      <div className="mb-6 flex flex-wrap items-center justify-between gap-3">
        <div className="flex items-center gap-2.5">
          <span className="bg-primary/10 text-primary flex h-9 w-9 items-center justify-center rounded-lg">
            <History className="h-4.5 w-4.5" aria-hidden />
          </span>
          <h1 className="text-2xl font-semibold md:text-3xl">{t('ws.history')}</h1>
        </div>
        <div className="relative">
          <Search
            className="text-muted-foreground absolute top-1/2 left-3 h-4 w-4 -translate-y-1/2"
            aria-hidden
          />
          <Input
            value={q}
            onChange={(e) => setQ(e.target.value)}
            placeholder={t('ws.historySearch')}
            className="w-[260px] pl-9"
          />
        </div>
      </div>

      {list.isPending ? (
        <div className="space-y-3">
          {[0, 1, 2].map((i) => (
            <Skeleton key={i} className="h-20 w-full rounded-xl" />
          ))}
        </div>
      ) : (list.data?.conversations ?? []).length === 0 ? (
        <Card>
          <CardContent className="flex flex-col items-center gap-3 p-10 text-center">
            <MessageSquareText className="text-muted-foreground h-8 w-8" aria-hidden />
            <p className="text-sm">{q ? t('ws.historyNoResults') : t('ws.historyEmpty')}</p>
            <Button size="sm" onClick={() => navigate('/chat')}>
              {t('ws.chatNew')}
            </Button>
          </CardContent>
        </Card>
      ) : (
        <div className="space-y-3">
          {(list.data?.conversations ?? []).map((conv) => (
            <Card key={conv.id} className="hover:border-primary/40 transition-colors">
              <CardContent className="flex items-center gap-3 p-4">
                <button
                  type="button"
                  className="min-w-0 flex-1 text-left"
                  onClick={() => navigate(`/chat?c=${conv.id}`)}
                >
                  {editingId === conv.id ? (
                    <form
                      className="flex gap-2"
                      onSubmit={(e) => {
                        e.preventDefault();
                        const title = editTitle.trim();
                        if (title) renameMutation.mutate({ id: conv.id, title });
                      }}
                    >
                      <Input
                        autoFocus
                        value={editTitle}
                        onChange={(e) => setEditTitle(e.target.value)}
                        maxLength={80}
                        onClick={(e) => e.stopPropagation()}
                      />
                      <Button type="submit" size="sm" disabled={renameMutation.isPending}>
                        {t('ws.historyRenameSave')}
                      </Button>
                    </form>
                  ) : (
                    <>
                      <div className="flex items-center gap-2">
                        {conv.pinned === 1 ? (
                          <Pin className="text-primary h-3.5 w-3.5 shrink-0" aria-hidden />
                        ) : null}
                        <span className="truncate text-sm font-medium">{conv.title}</span>
                      </div>
                      <div className="text-muted-foreground mt-1 flex flex-wrap gap-x-3 text-xs">
                        <span>
                          {conv.message_count} {t('ws.historyMessages')}
                        </span>
                        {conv.tool ? (
                          <span>{t(TOOL_LABEL_KEYS[conv.tool] ?? 'ws.tools')}</span>
                        ) : null}
                        <span>
                          {new Date(conv.updated_at).toLocaleDateString(undefined, {
                            day: '2-digit',
                            month: '2-digit',
                            year: 'numeric',
                          })}
                        </span>
                      </div>
                    </>
                  )}
                </button>
                <div className="flex shrink-0 items-center gap-1">
                  <Button
                    variant="ghost"
                    size="sm"
                    className="h-8 w-8 p-0"
                    title={conv.pinned === 1 ? t('ws.unpin') : t('ws.pin')}
                    onClick={() => pinMutation.mutate({ id: conv.id, pinned: conv.pinned !== 1 })}
                  >
                    {conv.pinned === 1 ? (
                      <PinOff className="h-4 w-4" aria-hidden />
                    ) : (
                      <Pin className="h-4 w-4" aria-hidden />
                    )}
                  </Button>
                  <Button
                    variant="ghost"
                    size="sm"
                    className="h-8 w-8 p-0"
                    title={t('ws.historyRename')}
                    onClick={() => {
                      setEditingId(conv.id);
                      setEditTitle(conv.title);
                    }}
                  >
                    <Pencil className="h-4 w-4" aria-hidden />
                  </Button>
                  <Button
                    variant="ghost"
                    size="sm"
                    className="text-destructive h-8 w-8 p-0"
                    title={t('ws.historyDelete')}
                    disabled={deleteMutation.isPending}
                    onClick={() => {
                      if (window.confirm(t('ws.historyDeleteConfirm'))) {
                        deleteMutation.mutate(conv.id);
                      }
                    }}
                  >
                    <Trash2 className="h-4 w-4" aria-hidden />
                  </Button>
                </div>
              </CardContent>
            </Card>
          ))}
        </div>
      )}

      {deleteMutation.isError ? (
        <p className="text-destructive mt-4 text-sm">{t('ws.chatErrGeneric')}</p>
      ) : null}
      {renameMutation.isError ? (
        <p className="text-destructive mt-4 text-sm">{t('ws.chatErrGeneric')}</p>
      ) : null}
    </div>
  );
}

const TOOL_LABEL_KEYS: Record<string, I18nKey> = {
  study: 'ws.toolStudy',
  coding: 'ws.toolCoding',
  writing: 'ws.toolWriting',
  documents: 'ws.toolDocuments',
  tools: 'ws.toolTools',
};
