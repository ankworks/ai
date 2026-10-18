import { useEffect, useRef, useState } from 'react';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { Link, useSearchParams } from 'react-router-dom';
import {
  ArrowUp,
  Brain,
  Check,
  Download,
  FilePlus2,
  ImagePlus,
  LogIn,
  MessageSquareText,
  Plus,
  Sparkles,
  Square,
  Trash2,
  TriangleAlert,
  X,
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
import { Markdown } from '../lib/markdown';
import { parseStoredContent, useChatStore, type ChatMessage, type ToolId } from '../stores/chat';

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

interface ConversationDetail {
  conversation: { id: string; title: string; tool: string | null };
  messages: Array<{
    id: string;
    role: 'user' | 'assistant';
    content: string;
    request_id: string | null;
  }>;
}

interface LimitsResponse {
  storageConfigured: boolean;
  limits: { maxImagesPerMessage: number; maxImageMb: number };
  extensions: { image: string[] };
}

const AUTO_MODEL = 'conai-auto';

function errorCopyKey(code: string, status: number): I18nKey {
  if (status === 402 || code === 'insufficient_sparks') return 'ws.chatErr402';
  if (status === 429 || code === 'rate_limited') return 'ws.chatErr429';
  if (status === 503 || code === 'not_configured') return 'ws.chatErr503';
  if (code === 'quota_exceeded') return 'ws.uploadQuota';
  if (code === 'file_too_large') return 'ws.uploadTooLarge';
  if (code === 'unsupported_file') return 'ws.uploadUnsupported';
  return 'ws.chatErrGeneric';
}

function toolFromParam(value: string | null): ToolId | undefined {
  return value === 'study' ||
    value === 'coding' ||
    value === 'writing' ||
    value === 'documents' ||
    value === 'tools'
    ? value
    : undefined;
}

export function Chat() {
  const { t } = useI18n();
  const queryClient = useQueryClient();
  const [searchParams, setSearchParams] = useSearchParams();
  const [draft, setDraft] = useState('');
  const [pendingImages, setPendingImages] = useState<string[]>([]);
  const [uploading, setUploading] = useState(false);
  const [uploadError, setUploadError] = useState<I18nKey | null>(null);
  const [savedMemoryId, setSavedMemoryId] = useState<string | null>(null);
  const bottomRef = useRef<HTMLDivElement | null>(null);
  const fileInputRef = useRef<HTMLInputElement | null>(null);
  const loadedParamRef = useRef<string | null>(null);

  const me = useQuery({
    queryKey: ['me'],
    queryFn: () => apiFetch<MeResponse>('/v1/me'),
    retry: false,
  });
  const models = useQuery({
    queryKey: ['models'],
    queryFn: () => apiFetch<ModelsResponse>('/v1/models'),
  });
  const limitsQuery = useQuery({
    queryKey: ['uploadLimits'],
    queryFn: () => apiFetch<LimitsResponse>('/v1/files/limits'),
    staleTime: 5 * 60 * 1000,
    retry: false,
  });

  const {
    messages,
    model,
    tool,
    conversationId,
    isStreaming,
    lastMeta,
    lastUsage,
    error,
    setModel,
    setTool,
    clear,
    openConversation,
    stop,
    send,
  } = useChatStore();

  const signedOut = me.error instanceof ApiError && me.error.status === 401;

  // Tool preset from /chat?tool=coding (set once per param change).
  useEffect(() => {
    const paramTool = toolFromParam(searchParams.get('tool'));
    if (paramTool && paramTool !== tool && !isStreaming) setTool(paramTool);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [searchParams]);

  // Open a stored thread from History via /chat?c=<conversationId>.
  useEffect(() => {
    const convParam = searchParams.get('c');
    if (!convParam || convParam === conversationId) return;
    if (loadedParamRef.current === convParam) return;
    loadedParamRef.current = convParam;
    let cancelled = false;
    void apiFetch<ConversationDetail>(`/v1/ai/conversations/${convParam}`)
      .then((detail) => {
        if (cancelled) return;
        openConversation({
          id: detail.conversation.id,
          tool: toolFromParam(detail.conversation.tool),
          messages: detail.messages.map((m) => {
            const { text, images } = parseStoredContent(m.content);
            const msg: ChatMessage = {
              id: m.id,
              role: m.role,
              content: text,
            };
            if (images.length > 0) msg.images = images;
            if (m.request_id) msg.requestId = m.request_id;
            return msg;
          }),
        });
      })
      .catch(() => {
        // Thread vanished or access denied — drop back to a fresh chat.
        if (!cancelled) {
          loadedParamRef.current = null;
          clear();
          setSearchParams({}, { replace: true });
        }
      });
    return () => {
      cancelled = true;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [searchParams, conversationId]);

  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: 'smooth', block: 'end' });
  }, [messages]);

  const handleSend = async () => {
    const text = draft;
    if ((!text.trim() && pendingImages.length === 0) || isStreaming) return;
    const images = [...pendingImages];
    setDraft('');
    setPendingImages([]);
    setUploadError(null);
    await send(text, images);
    void queryClient.invalidateQueries({ queryKey: ['me'] });
  };

  const handleNewChat = () => {
    clear();
    setPendingImages([]);
    setUploadError(null);
    loadedParamRef.current = null;
    setSearchParams(tool ? { tool } : {}, { replace: true });
  };

  const handleAttach = async (file: File) => {
    setUploadError(null);
    const limits = limitsQuery.data;
    if (!limits) return;
    const ext = (file.name.split('.').pop() ?? '').toLowerCase();
    if (!limits.extensions.image.includes(ext)) {
      setUploadError('ws.uploadUnsupported');
      return;
    }
    if (file.size > limits.limits.maxImageMb * 1024 * 1024) {
      setUploadError('ws.uploadTooLarge');
      return;
    }
    if (pendingImages.length >= limits.limits.maxImagesPerMessage || isStreaming) return;
    setUploading(true);
    try {
      const presign = await apiFetch<{ file: { id: string }; uploadUrl: string }>(
        '/v1/files/presign',
        {
          method: 'POST',
          json: {
            filename: file.name,
            sizeBytes: file.size,
            mimeType: file.type || 'image/png',
          },
        },
      );
      const put = await fetch(presign.uploadUrl, {
        method: 'PUT',
        headers: { 'Content-Type': file.type || 'application/octet-stream' },
        body: file,
      });
      if (!put.ok) throw new ApiError(put.status, 'storage_error', 'Upload failed');
      await apiFetch(`/v1/files/${presign.file.id}/confirm`, { method: 'POST' });
      const { downloadUrl } = await apiFetch<{ downloadUrl: string }>(
        `/v1/files/${presign.file.id}`,
      );
      setPendingImages((prev) => [...prev, downloadUrl]);
      void queryClient.invalidateQueries({ queryKey: ['files'] });
    } catch (err) {
      if (err instanceof ApiError) setUploadError(errorCopyKey(err.code, err.status));
      else setUploadError('ws.uploadFailed');
    } finally {
      setUploading(false);
    }
  };

  const handleExport = () => {
    const lines: string[] = ['# ConAI chat', ''];
    for (const m of messages) {
      if (!m.content.trim()) continue;
      lines.push(m.role === 'user' ? '**You:**' : '**ConAI:**', m.content, '');
    }
    const blob = new Blob([lines.join('\n')], { type: 'text/markdown;charset=utf-8' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `conai-chat-${new Date().toISOString().slice(0, 10)}.md`;
    a.click();
    URL.revokeObjectURL(url);
  };

  const handleSaveMemory = async (m: ChatMessage) => {
    if (!m.content.trim()) return;
    try {
      await apiFetch('/v1/ai/memory', {
        method: 'POST',
        json: {
          content: m.content.slice(0, 2000),
          source: 'model',
          ...(m.requestId ? { sourceMessageId: m.requestId } : {}),
        },
      });
      setSavedMemoryId(m.id);
      setTimeout(() => setSavedMemoryId((prev) => (prev === m.id ? null : prev)), 2500);
      void queryClient.invalidateQueries({ queryKey: ['memories'] });
    } catch {
      setUploadError('ws.chatErrGeneric');
    }
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
      {/* Header: title, thread state, model, balance */}
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div className="flex items-center gap-2.5">
          <h1 className="text-2xl font-semibold md:text-3xl">{t('ws.chat')}</h1>
          {tool ? <Badge variant="secondary">{t(`ws.tool${cap(tool)}` as I18nKey)}</Badge> : null}
          {conversationId ? <Badge variant="outline">{t('ws.chatSavedThread')}</Badge> : null}
          {lastMeta?.fallbackUsed ? (
            <Badge variant="secondary">{t('ws.chatFallbackUsed')}</Badge>
          ) : null}
        </div>
        <div className="flex items-center gap-2">
          <Button
            variant="outline"
            size="sm"
            onClick={handleNewChat}
            disabled={isStreaming && messages.length === 0}
          >
            <Plus className="mr-1.5 h-3.5 w-3.5" aria-hidden />
            {t('ws.chatNew')}
          </Button>
          <Button variant="ghost" size="sm" onClick={handleExport} disabled={messages.length === 0}>
            <Download className="mr-1.5 h-3.5 w-3.5" aria-hidden />
            {t('ws.chatExport')}
          </Button>
          <Select
            value={model ?? AUTO_MODEL}
            onValueChange={(v) => setModel(v === AUTO_MODEL ? undefined : v)}
            disabled={isStreaming}
          >
            <SelectTrigger className="w-[180px]" aria-label={t('ws.chatModel')}>
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
                <div className="bg-primary text-primary-foreground max-w-[85%] space-y-2 rounded-2xl rounded-br-md px-4 py-2.5 text-sm leading-relaxed break-words whitespace-pre-wrap">
                  {m.content}
                  {m.images && m.images.length > 0 ? (
                    <div className="flex flex-wrap gap-2">
                      {m.images.map((src, idx) => (
                        <img
                          key={idx}
                          src={src}
                          alt={t('ws.chatImageAlt')}
                          className="border-primary-foreground/20 h-28 w-28 rounded-lg border object-cover"
                        />
                      ))}
                    </div>
                  ) : null}
                </div>
              ) : (
                <Card className="bg-card w-full max-w-[92%]">
                  <CardContent className="p-4">
                    <div className="mb-1.5 flex items-center justify-between gap-2">
                      <span className="text-muted-foreground text-xs font-medium">ConAI</span>
                      <div className="flex items-center gap-1">
                        {savedMemoryId === m.id ? (
                          <span className="text-primary flex items-center gap-1 text-xs">
                            <Check className="h-3 w-3" aria-hidden />
                            {t('ws.memorySaved')}
                          </span>
                        ) : (
                          <>
                            <Button
                              variant="ghost"
                              size="sm"
                              className="h-6 px-2 text-xs"
                              onClick={() => void handleSaveMemory(m)}
                              disabled={!m.content.trim()}
                              title={t('ws.saveMemory')}
                            >
                              <Brain className="h-3 w-3" aria-hidden />
                            </Button>
                            <Button
                              variant="ghost"
                              size="sm"
                              className="h-6 px-2 text-xs"
                              onClick={() => void navigator.clipboard.writeText(m.content)}
                              title={t('ws.copy')}
                            >
                              <FilePlus2 className="h-3 w-3" aria-hidden />
                            </Button>
                          </>
                        )}
                      </div>
                    </div>
                    <div className="text-sm leading-relaxed break-words">
                      <Markdown text={m.content} />
                      {isStreaming && m.id === messages.at(-1)?.id ? (
                        <span className="bg-primary ml-0.5 inline-block h-4 w-[3px] animate-pulse align-middle" />
                      ) : null}
                    </div>
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
      {uploadError ? (
        <div className="border-destructive/30 bg-destructive/5 text-destructive flex items-start gap-2.5 rounded-lg border px-4 py-3 text-sm">
          <TriangleAlert className="mt-0.5 h-4 w-4 shrink-0" aria-hidden />
          <span>{t(uploadError)}</span>
        </div>
      ) : null}

      {/* Pending attachments */}
      {pendingImages.length > 0 ? (
        <div className="flex flex-wrap gap-2">
          {pendingImages.map((src, idx) => (
            <div key={idx} className="relative">
              <img
                src={src}
                alt={t('ws.chatImageAlt')}
                className="border-border h-20 w-20 rounded-lg border object-cover"
              />
              <button
                type="button"
                onClick={() => setPendingImages((prev) => prev.filter((_, i) => i !== idx))}
                className="bg-background/90 border-border absolute -top-2 -right-2 rounded-full border p-0.5"
                aria-label={t('ws.chatRemoveImage')}
              >
                <X className="h-3.5 w-3.5" aria-hidden />
              </button>
            </div>
          ))}
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
        <input
          ref={fileInputRef}
          type="file"
          accept="image/png,image/jpeg,image/webp,image/gif"
          className="hidden"
          onChange={(e) => {
            const file = e.target.files?.[0];
            e.target.value = '';
            if (file) void handleAttach(file);
          }}
        />
        <div className="mt-2 flex items-center justify-between gap-2">
          <div className="flex items-center gap-2">
            <Button
              variant="ghost"
              size="sm"
              onClick={() => fileInputRef.current?.click()}
              disabled={
                isStreaming ||
                uploading ||
                pendingImages.length >= (limitsQuery.data?.limits.maxImagesPerMessage ?? 2)
              }
              title={t('ws.chatAttach')}
            >
              {uploading ? (
                <Skeleton className="h-3.5 w-3.5" />
              ) : (
                <ImagePlus className="mr-1.5 h-3.5 w-3.5" aria-hidden />
              )}
              {t('ws.chatAttach')}
            </Button>
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
            <Button
              size="sm"
              onClick={() => void handleSend()}
              disabled={!draft.trim() && pendingImages.length === 0}
            >
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

function cap(value: string): string {
  return value.charAt(0).toUpperCase() + value.slice(1);
}
