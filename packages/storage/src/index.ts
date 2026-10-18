export * from './sigv4';
/**
 * Storage contracts (Phase 1 types; B2 S3 adapter lands in Phase 4 — ARCHITECTURE.md §11).
 *
 * Buckets are PRIVATE. Downloads/preview always authorize through the Worker before a
 * short-lived presigned URL or streamed response is issued. Personal data never lands in
 * team buckets and vice versa.
 */

export type StorageScope = 'personal' | 'team' | 'verification' | 'temp' | 'public';

/** Bucket names per scope. B2 free allowance is shared across buckets (docs/FREE_TIER.md). */
export const BUCKETS: Record<StorageScope, string> = {
  personal: 'conai-personal',
  team: 'conai-teams',
  verification: 'conai-verification',
  temp: 'conai-temp',
  public: 'conai-public',
};

/** Defaults — runtime authority is `platform_settings['uploads.limits']` (admin-editable). */
export const DEFAULT_UPLOAD_LIMITS = {
  maxImagesPerMessage: 2,
  maxDocumentsPerMessage: 2,
  maxPdfPages: 50,
  maxImageMb: 10,
  maxDocumentMb: 20,
} as const;

export const IMAGE_EXTENSIONS = ['png', 'jpg', 'jpeg', 'webp', 'gif'] as const;
export const DOCUMENT_EXTENSIONS = [
  'pdf',
  'txt',
  'md',
  'csv',
  'json',
  'docx',
  'pptx',
  'xlsx',
] as const;

export type FileKind = 'image' | 'document';

/** D1 `files` table metadata (created in migration 0004). */
export interface FileMeta {
  id: string;
  owner_id: string;
  scope: StorageScope;
  team_id: string | null;
  kind: FileKind;
  filename: string; // sanitized display name
  storage_key: string; // random UUID path — never user-controlled (SECURITY.md §10)
  mime_type: string;
  size_bytes: number;
  page_count: number | null;
  created_at: string;
}

export interface UploadQuota {
  /** Quota in bytes for the given scope owner; null = unlimited (should not happen for users). */
  limitBytes: number;
  usedBytes: number;
}

export function canUpload(quota: UploadQuota, incomingBytes: number): boolean {
  if (quota.limitBytes <= 0) return false;
  return quota.usedBytes + incomingBytes <= quota.limitBytes;
}

export function validateUploadCounts(
  images: number,
  documents: number,
  limits: { maxImagesPerMessage: number; maxDocumentsPerMessage: number },
): { ok: true } | { ok: false; error: string } {
  if (images > limits.maxImagesPerMessage) {
    return { ok: false, error: `At most ${limits.maxImagesPerMessage} images per message` };
  }
  if (documents > limits.maxDocumentsPerMessage) {
    return { ok: false, error: `At most ${limits.maxDocumentsPerMessage} documents per message` };
  }
  return { ok: true };
}
