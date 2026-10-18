/**
 * Personal Storage (Phase 4, ARCHITECTURE §11): byte quota from the plan,
 * direct-to-B2 uploads via presigned URLs (bytes never pass the Worker),
 * honest `not_configured` state when the deployment has no B2 keys.
 */

import { useRef, useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { Download, FileText, HardDrive, ImageIcon, Loader2, Trash2, Upload } from 'lucide-react';
import { Badge, Button, Card, CardContent, Skeleton, useI18n } from '@conai/ui';
import { apiFetch, ApiError } from '../lib/api';

interface FileRow {
  id: string;
  filename: string;
  kind: 'image' | 'document';
  mime_type: string;
  size_bytes: number;
  status: 'pending' | 'stored';
  created_at: string;
  stored_at: string | null;
}

interface FilesList {
  files: FileRow[];
  usage: { usedBytes: number; limitBytes: number | null };
}

interface LimitsResponse {
  storageConfigured: boolean;
  limits: { maxImageMb: number; maxDocumentMb: number };
  extensions: { image: string[]; document: string[] };
}

function formatBytes(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  if (bytes < 1024 * 1024 * 1024) return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
  return `${(bytes / (1024 * 1024 * 1024)).toFixed(2)} GB`;
}

export function StoragePage() {
  const { t } = useI18n();
  const queryClient = useQueryClient();
  const fileInputRef = useRef<HTMLInputElement | null>(null);
  const [uploadError, setUploadError] = useState<string | null>(null);
  const [busyId, setBusyId] = useState<string | null>(null);

  const list = useQuery({
    queryKey: ['files'],
    queryFn: () => apiFetch<FilesList>('/v1/files'),
    refetchOnWindowFocus: false,
    retry: false,
  });
  const limits = useQuery({
    queryKey: ['uploadLimits'],
    queryFn: () => apiFetch<LimitsResponse>('/v1/files/limits'),
    retry: false,
    staleTime: 5 * 60 * 1000,
  });

  const invalidate = () => queryClient.invalidateQueries({ queryKey: ['files'] });

  const uploadMutation = useMutation({
    mutationFn: async (file: File) => {
      const presign = await apiFetch<{ file: { id: string }; uploadUrl: string }>(
        '/v1/files/presign',
        {
          method: 'POST',
          json: {
            filename: file.name,
            sizeBytes: file.size,
            mimeType: file.type || 'application/octet-stream',
          },
        },
      );
      const put = await fetch(presign.uploadUrl, {
        method: 'PUT',
        headers: { 'Content-Type': file.type || 'application/octet-stream' },
        body: file,
      });
      if (!put.ok) throw new ApiError(put.status, 'storage_error', 'B2 upload failed');
      await apiFetch(`/v1/files/${presign.file.id}/confirm`, { method: 'POST' });
    },
    onSuccess: () => {
      setUploadError(null);
      void invalidate();
    },
    onError: (err) => {
      if (err instanceof ApiError) {
        if (err.code === 'quota_exceeded') setUploadError(t('acc.storErrQuota'));
        else if (err.code === 'file_too_large') setUploadError(t('acc.storErrTooLarge'));
        else if (err.code === 'unsupported_file') setUploadError(t('acc.storErrType'));
        else if (err.code === 'not_configured') setUploadError(t('acc.storNotConfigured'));
        else setUploadError(t('acc.storErrGeneric'));
      } else setUploadError(t('acc.storErrGeneric'));
    },
  });

  const downloadMutation = useMutation({
    mutationFn: async (id: string) => {
      setBusyId(id);
      try {
        const { downloadUrl } = await apiFetch<{ downloadUrl: string }>(`/v1/files/${id}`);
        window.open(downloadUrl, '_blank', 'noopener,noreferrer');
      } finally {
        setBusyId(null);
      }
    },
  });

  const deleteMutation = useMutation({
    mutationFn: (id: string) => apiFetch(`/v1/files/${id}`, { method: 'DELETE' }),
    onSuccess: () => void invalidate(),
  });

  const signedOut = list.error instanceof ApiError && list.error.status === 401;
  if (signedOut) {
    return (
      <div className="space-y-4">
        <h1 className="text-xl font-semibold">{t('acc.storage')}</h1>
        <Card>
          <CardContent className="p-6 text-sm">{t('ws.chatSignInBody')}</CardContent>
        </Card>
      </div>
    );
  }

  const usage = list.data?.usage ?? { usedBytes: 0, limitBytes: null };
  const percent =
    usage.limitBytes && usage.limitBytes > 0
      ? Math.min(100, Math.round((usage.usedBytes / usage.limitBytes) * 100))
      : 0;
  const configured = limits.data?.storageConfigured ?? true;
  const storedFiles = (list.data?.files ?? []).filter((f) => f.status === 'stored');
  const pendingFiles = (list.data?.files ?? []).filter((f) => f.status === 'pending');

  const onPickFile = (file: File | undefined) => {
    if (!file) return;
    const lim = limits.data;
    if (lim) {
      const ext = (file.name.split('.').pop() ?? '').toLowerCase();
      const allowed = [...lim.extensions.image, ...lim.extensions.document];
      if (!allowed.includes(ext)) {
        setUploadError(t('acc.storErrType'));
        return;
      }
      const maxMb = lim.extensions.image.includes(ext)
        ? lim.limits.maxImageMb
        : lim.limits.maxDocumentMb;
      if (file.size > maxMb * 1024 * 1024) {
        setUploadError(`${t('acc.storErrTooLarge')} (max ${maxMb} MB)`);
        return;
      }
    }
    uploadMutation.mutate(file);
  };

  return (
    <div className="space-y-6">
      <div className="flex items-center gap-2.5">
        <span className="bg-primary/10 text-primary flex h-9 w-9 items-center justify-center rounded-lg">
          <HardDrive className="h-4.5 w-4.5" aria-hidden />
        </span>
        <h1 className="text-xl font-semibold">{t('acc.storage')}</h1>
      </div>

      {!configured ? (
        <Card className="border-primary/40">
          <CardContent className="p-4 text-sm leading-relaxed">
            {t('acc.storNotConfigured')}{' '}
            <span className="text-muted-foreground">{t('acc.storNotConfiguredNote')}</span>
          </CardContent>
        </Card>
      ) : null}

      {/* Usage */}
      <Card>
        <CardContent className="space-y-3 p-4">
          <div className="flex items-center justify-between text-sm">
            <span className="font-medium">{t('acc.storUsage')}</span>
            <span className="text-muted-foreground">
              {formatBytes(usage.usedBytes)}
              {usage.limitBytes != null ? ` / ${formatBytes(usage.limitBytes)}` : ''}
              {usage.limitBytes != null ? ` (${percent}%)` : ''}
            </span>
          </div>
          {usage.limitBytes != null ? (
            <div className="bg-muted h-2 w-full overflow-hidden rounded-full">
              <div
                className="bg-primary h-full rounded-full transition-all"
                style={{ width: `${percent}%` }}
              />
            </div>
          ) : (
            <p className="text-muted-foreground text-xs">{t('acc.storNoQuota')}</p>
          )}
          <div className="flex items-center gap-2">
            <input
              ref={fileInputRef}
              type="file"
              className="hidden"
              accept={[
                ...(limits.data?.extensions.image ?? []),
                ...(limits.data?.extensions.document ?? []),
              ]
                .map((e) => `.${e}`)
                .join(',')}
              onChange={(e) => {
                const file = e.target.files?.[0];
                e.target.value = '';
                onPickFile(file);
              }}
            />
            <Button
              size="sm"
              disabled={!configured || uploadMutation.isPending || list.error instanceof ApiError}
              onClick={() => fileInputRef.current?.click()}
            >
              {uploadMutation.isPending ? (
                <Loader2 className="mr-1.5 h-3.5 w-3.5 animate-spin" aria-hidden />
              ) : (
                <Upload className="mr-1.5 h-3.5 w-3.5" aria-hidden />
              )}
              {t('acc.storUpload')}
            </Button>
            {uploadError ? <span className="text-destructive text-xs">{uploadError}</span> : null}
          </div>
        </CardContent>
      </Card>

      {/* Files */}
      {list.isPending ? (
        <Skeleton className="h-32 w-full rounded-xl" />
      ) : storedFiles.length === 0 && pendingFiles.length === 0 ? (
        <Card>
          <CardContent className="text-muted-foreground p-8 text-center text-sm">
            {t('acc.storEmpty')}
          </CardContent>
        </Card>
      ) : (
        <div className="space-y-2">
          {[...pendingFiles, ...storedFiles].map((f) => (
            <Card key={f.id}>
              <CardContent className="flex items-center gap-3 p-3.5">
                <span className="bg-muted text-muted-foreground flex h-9 w-9 shrink-0 items-center justify-center rounded-lg">
                  {f.kind === 'image' ? (
                    <ImageIcon className="h-4 w-4" aria-hidden />
                  ) : (
                    <FileText className="h-4 w-4" aria-hidden />
                  )}
                </span>
                <div className="min-w-0 flex-1">
                  <div className="truncate text-sm font-medium">{f.filename}</div>
                  <div className="text-muted-foreground mt-0.5 flex flex-wrap gap-x-3 text-xs">
                    <span>{formatBytes(f.size_bytes)}</span>
                    <span>{new Date(f.created_at).toLocaleDateString()}</span>
                    {f.status === 'pending' ? (
                      <Badge variant="outline">{t('acc.storPending')}</Badge>
                    ) : null}
                  </div>
                </div>
                <div className="flex shrink-0 items-center gap-1">
                  <Button
                    variant="ghost"
                    size="sm"
                    className="h-8 w-8 p-0"
                    title={t('acc.storDownload')}
                    disabled={f.status !== 'stored' || downloadMutation.isPending}
                    onClick={() => downloadMutation.mutate(f.id)}
                  >
                    {busyId === f.id ? (
                      <Loader2 className="h-4 w-4 animate-spin" aria-hidden />
                    ) : (
                      <Download className="h-4 w-4" aria-hidden />
                    )}
                  </Button>
                  <Button
                    variant="ghost"
                    size="sm"
                    className="text-destructive h-8 w-8 p-0"
                    title={t('acc.storDelete')}
                    disabled={deleteMutation.isPending}
                    onClick={() => {
                      if (window.confirm(t('acc.storDeleteConfirm'))) {
                        deleteMutation.mutate(f.id);
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
    </div>
  );
}
