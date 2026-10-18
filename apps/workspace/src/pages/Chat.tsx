import { useEffect, useRef, useState } from 'react';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { Link } from 'react-router-dom';
import {
  ArrowUp,
  LogIn,
  MessageSquareText,
  Sparkles,
  Square,
  Trash2,
  TriangleAlert,
} from 'lucide-react';
import {
  Badge,
  Button,
  Card,
  CardContent,
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
  Skeleton,
  useI18n,
  type I18nKey,
} from '@conai/ui';
import { publicEnv } from '../env';
import { apiFetch, ApiError } from '../lib/api';
import { useChatStore } from '../stores/chat';

interface MeResponse {
  user: { id: string; username: string | null };
  wallet: { balance: number; dailyLimit: number | null; lastRefillAt: string | null };
}

interface ModelsResponse {
  auto: { id: string; displayName: string };
  models: Array<{
    id: string;
    displayName: string;
    description: string | null;
    capabilities: string[];
    pricingMultiplier: number;
    enabled: boolean;
  }>;
}

const AUTO_MODEL = 'conai-auto';

function errorCopyKey(code: string, status: number): I18nKey {
  if (status === 402 || code === 'insufficient_sparks') return 'ws.chatErr402';
  if (status === 429 || code === 'rate_limited') return 'ws.chatErr429';
  if (status === 503 || code === 'not_configured') return 'ws.chatErr503';
  return 'ws.chatErrGeneric';
}

export function Chat() {
  const { t } = useI18n();
  const queryClient = useQueryClient();
  const [draft, setDraft] = useState('');
  const bottomRef = useRef<HTMLDivElement | null>(null);

  const me = useQuery({
    queryKey: ['me'],
    queryFn: () => apiFetch<MeResponse>('/v1/me'),
    retry: false,
  });
  const models = useQuery({
    queryKey: ['models'],
    queryFn: () => apiFetch<ModelsResponse>('/v1/models'),
  });

  const { messages, model, isStreaming, lastMeta, lastUsage, error, setModel, clear, stop, send } =
    useChatStore();

  const signedOut = me.error instanceof ApiError && me.error.status === 401;

  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: 'smooth', block: 'end' });
  }, [messages]);

  const handleSend = async () => {
    const text = draft;
    if (!text.trim() || isStreaming) return;
    setDraft('');
    await send(text);
    void queryClient.invalidateQueries({ queryKey: ['me'] });
  };

  if (signedOut) {
    return (
      <div className="mx-auto w-full max-w-3xl px-4 py-12 md:px-8 md:py-16">
        <Card>
          <CardContent className="flex flex-col items-start gap-4 p-6 md:p-8">
            <span className="bg-primary/10 text-primary flex h-11 w-11 items-center justify-center rounded-lg">
              <LogIn className="h-5 w-5" aria-hidden />
            </span>
            <div className="space-y-1.5">
              <h1 className="text-xl font-semibold">{t('ws.chatSignInTitle')}</h1>
              <p className="text-muted-foreground text-sm leading-relaxed">
                {t('ws.chatSignInBody')}
              </p>
            </div>
            <a href={`${publicEnv.VITE_ACCOUNT_URL}/sign-in`}>
              <Button>
                <LogIn className="mr-2 h-4 w-4" aria-hidden />
                {t('ws.chatSignInCta')}
              </Button>
            </a>
          </CardContent>
        </Card>
      </div>
    );
  }

  return (
    <div className="mx-auto flex w-full max-w-3xl flex-col gap-4 px-4 py-8 md:px-8 md:py-10">
      {/* Header: title, model, balance */}
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div className="flex items-center gap-2.5">
          <h1 className="text-2xl font-semibold md:text-3xl">{t('ws.chat')}</h1>
          {lastMeta?.fallbackUsed ? (
            <Badge variant="secondary">{t('ws.chatFallbackUsed')}</Badge>
          ) : null}
        </div>
        <div className="flex items-center gap-2">
          <Select
            value={model ?? AUTO_MODEL}
            onValueChange={(v) => setModel(v === AUTO_MODEL ? undefined : v)}
            disabled={isStreaming}
          >
            <SelectTrigger className="w-[190px]" aria-label={t('ws.chatModel')}>
              <SelectValue placeholder={t('ws.chatModel')} />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value={AUTO_MODEL}>{t('ws.chatAuto')}</SelectItem>
              {(models.data?.models ?? [])
                .filter((m) => m.enabled)
                .map((m) => (
                  <SelectItem key={m.id} value={m.id}>
                    {m.displayName}
                  </SelectItem>
                ))}
            </SelectContent>
          </Select>
          <Badge variant="outline" className="gap-1.5 px-2.5 py-1.5">
            <Sparkles className="text-primary h-3.5 w-3.5" aria-hidden />
            {me.isPending ? <Skeleton className="h-4 w-8" /> : (me.data?.wallet.balance ?? 0)}
            <span className="text-muted-foreground font-normal">{t('ws.chatBalance')}</span>
          </Badge>
        </div>
      </div>

      {/* Conversation */}
      <div className="flex min-h-[45vh] flex-1 flex-col gap-4">
        {messages.length === 0 ? (
          <div className="flex flex-1 flex-col items-center justify-center py-16 text-center">
            <span className="bg-primary/10 text-primary flex h-12 w-12 items-center justify-center rounded-xl">
              <MessageSquareText className="h-6 w-6" aria-hidden />
            </span>
            <h2 className="mt-4 text-lg font-medium">{t('ws.chatEmptyTitle')}</h2>
            <p className="text-muted-foreground mt-1.5 max-w-sm text-sm leading-relaxed">
              {t('ws.chatEmptyBody')}
            </p>
          </div>
        ) : (
          messages.map((m) => (
            <div
              key={m.id}
              className={`flex ${m.role === 'user' ? 'justify-end' : 'justify-start'}`}
            >
              {m.role === 'user' ? (
                <p className="bg-primary text-primary-foreground max-w-[85%] rounded-2xl rounded-br-md px-4 py-2.5 text-sm leading-relaxed break-words whitespace-pre-wrap">
                  {m.content}
                </p>
              ) : (
                <Card className="bg-card w-full max-w-[92%]">
                  <CardContent className="p-4">
                    <div className="text-muted-foreground mb-1.5 text-xs font-medium">ConAI</div>
                    <p className="text-sm leading-relaxed break-words whitespace-pre-wrap">
                      {m.content}
                      {isStreaming && m.id === messages.at(-1)?.id ? (
                        <span className="bg-primary ml-0.5 inline-block h-4 w-[3px] animate-pulse align-middle" />
                      ) : null}
                    </p>
                    {m.errorCode ? (
                      <p className="text-destructive mt-2 text-xs">{m.errorCode}</p>
                    ) : null}
                  </CardContent>
                </Card>
              )}
            </div>
          ))
        )}
        <div ref={bottomRef} />
      </div>

      {/* Error banner */}
      {error ? (
        <div className="border-destructive/30 bg-destructive/5 text-destructive flex items-start gap-2.5 rounded-lg border px-4 py-3 text-sm">
          <TriangleAlert className="mt-0.5 h-4 w-4 shrink-0" aria-hidden />
          <span>{t(errorCopyKey(error.code, error.status))}</span>
        </div>
      ) : null}

      {/* Composer */}
      <div className="border-border bg-card rounded-xl border p-3">
        <textarea
          value={draft}
          onChange={(e) => setDraft(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === 'Enter' && !e.shiftKey) {
              e.preventDefault();
              void handleSend();
            }
          }}
          placeholder={t('ws.chatPlaceholder')}
          rows={2}
          disabled={isStreaming}
          className="focus-visible:ring-ring w-full resize-none bg-transparent px-1 py-1 text-sm leading-relaxed outline-none disabled:opacity-60"
        />
        <div className="mt-2 flex items-center justify-between gap-2">
          <div className="flex items-center gap-2">
            {messages.length > 0 ? (
              <Button variant="ghost" size="sm" onClick={clear} disabled={isStreaming}>
                <Trash2 className="mr-1.5 h-3.5 w-3.5" aria-hidden />
                {t('ws.chatClear')}
              </Button>
            ) : null}
            {lastUsage?.sparks !== undefined && lastUsage.sparks > 0 ? (
              <span className="text-muted-foreground text-xs">
                −{lastUsage.sparks} {t('ws.chatSpends')}
              </span>
            ) : null}
          </div>
          {isStreaming ? (
            <Button variant="outline" size="sm" onClick={stop}>
              <Square className="mr-1.5 h-3.5 w-3.5 fill-current" aria-hidden />
              {t('ws.chatStop')}
            </Button>
          ) : (
            <Button size="sm" onClick={() => void handleSend()} disabled={!draft.trim()}>
              {t('ws.chatSend')}
              <ArrowUp className="ml-1.5 h-3.5 w-3.5" aria-hidden />
            </Button>
          )}
        </div>
      </div>

      <p className="text-muted-foreground/70 text-center text-xs">
        <Link to="/" className="hover:text-foreground underline-offset-2">
          {t('ws.home')}
        </Link>
      </p>
    </div>
  );
}
