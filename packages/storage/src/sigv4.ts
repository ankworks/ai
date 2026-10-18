/**
 * AWS Signature Version 4 for S3-compatible endpoints (Backblaze B2) —
 * dependency-free (WebCrypto only, Workers-safe).
 *
 * Two modes:
 *  - `presignUrl()`  → query-string auth for client↔B2 transfers (upload PUT,
 *    download GET) so file bytes NEVER proxy through the Worker.
 *  - `signRequest()` → Authorization-header auth for server-side calls
 *    (HEAD verification after upload, DELETE on Library removal).
 *
 * Verified against AWS's published SigV4 test vectors (see sigv4.test.ts).
 */

export interface AwsCredentials {
  accessKeyId: string;
  secretAccessKey: string;
  region: string;
  service?: string;
}

const encoder = new TextEncoder();

function toHex(buf: ArrayBuffer): string {
  return [...new Uint8Array(buf)].map((b) => b.toString(16).padStart(2, '0')).join('');
}

async function sha256Hex(data: string | Uint8Array): Promise<string> {
  // fresh copy types as Uint8Array<ArrayBuffer> (TS 5.9 ArrayBuffer generics)
  const bytes = typeof data === 'string' ? encoder.encode(data) : new Uint8Array(data);
  return toHex(await crypto.subtle.digest('SHA-256', bytes));
}

async function hmac(key: BufferSource, data: string): Promise<ArrayBuffer> {
  const cryptoKey = await crypto.subtle.importKey(
    'raw',
    key,
    { name: 'HMAC', hash: 'SHA-256' },
    false,
    ['sign'],
  );
  return crypto.subtle.sign('HMAC', cryptoKey, encoder.encode(data));
}

/** RFC 3986 encoding: unreserved chars kept, `/` kept (URI path), everything else %XX. */
export function uriEncode(value: string, encodeSlash = true): string {
  return [...value]
    .map((ch) => {
      if (/[A-Za-z0-9\-._~]/.test(ch)) return ch;
      if (ch === '/' && !encodeSlash) return ch;
      return [...encoder.encode(ch)]
        .map((b) => `%${b.toString(16).toUpperCase().padStart(2, '0')}`)
        .join('');
    })
    .join('');
}

/** Canonical query string: RFC3986-encoded, sorted by key then value. */
function canonicalQuery(url: URL): string {
  const pairs: Array<[string, string]> = [];
  url.searchParams.forEach((v, k) => pairs.push([k, v]));
  pairs.sort((a, b) =>
    a[0] < b[0] ? -1 : a[0] > b[0] ? 1 : a[1] < b[1] ? -1 : a[1] > b[1] ? 1 : 0,
  );
  return pairs.map(([k, v]) => `${uriEncode(k)}=${uriEncode(v)}`).join('&');
}

/**
 * Canonical URI computed from the RAW input string (before WHATWG normalization —
 * `new URL().pathname` may already contain %XX which must not be encoded twice).
 */
function canonicalPath(raw: string): string {
  const afterScheme = raw.indexOf('://');
  const afterHost = afterScheme >= 0 ? raw.indexOf('/', afterScheme + 3) : raw.indexOf('/');
  let path = afterHost >= 0 ? raw.slice(afterHost) : '/';
  const cut = path.search(/[?#]/);
  if (cut >= 0) path = path.slice(0, cut);
  if (!path.startsWith('/')) path = `/${path}`;
  return path
    .split('/')
    .map((seg) => uriEncode(seg, false))
    .join('/');
}

/** Raw string form of the target (string inputs pass through untouched). */
function rawUrl(url: string | URL): string {
  return typeof url === 'string' ? url : url.href;
}

function amzDates(now: Date): { date: string; stamp: string } {
  const stamp = now
    .toISOString()
    .replace(/[-:]/g, '')
    .replace(/\.\d{3}/, '');
  return { date: stamp.slice(0, 8), stamp };
}

async function signingKey(
  credentials: AwsCredentials,
  date: string,
  region: string,
  service: string,
): Promise<ArrayBuffer> {
  const kDate = await hmac(encoder.encode(`AWS4${credentials.secretAccessKey}`), date);
  const kRegion = await hmac(kDate, region);
  const kService = await hmac(kRegion, service);
  return hmac(kService, 'aws4_request');
}

interface SignInput {
  method: string;
  url: URL;
  raw: string;
  credentials: AwsCredentials;
  now: Date;
  /** Headers included in the signature (lowercase names). Host always included. */
  signedHeaders: string[];
  canonicalHeaders: string;
  payloadHash: string;
}

async function stringToSign(input: SignInput, stamp: string, date: string): Promise<string> {
  const service = input.credentials.service ?? 's3';
  const canonical = [
    input.method.toUpperCase(),
    canonicalPath(input.raw),
    canonicalQuery(input.url),
    input.canonicalHeaders,
    [...input.signedHeaders].sort().join(';'),
    input.payloadHash,
  ].join('\n');
  return [
    'AWS4-HMAC-SHA256',
    stamp,
    `${date}/${input.credentials.region}/${service}/aws4_request`,
    await sha256Hex(canonical),
  ].join('\n');
}

/**
 * Presigned URL (query auth, `UNSIGNED-PAYLOAD`) — for browser↔B2 transfers.
 * Only the `host` header is signed (browsers cannot add signed headers).
 */
export async function presignUrl(options: {
  method: 'GET' | 'PUT' | 'DELETE';
  url: string | URL;
  credentials: AwsCredentials;
  expiresIn?: number;
  now?: Date;
}): Promise<string> {
  const raw = rawUrl(options.url);
  const url = new URL(raw);
  const now = options.now ?? new Date();
  const expiresIn = options.expiresIn ?? 900;
  const service = options.credentials.service ?? 's3';
  const { date, stamp } = amzDates(now);
  const credential = `${options.credentials.accessKeyId}/${date}/${options.credentials.region}/${service}/aws4_request`;

  url.searchParams.set('X-Amz-Algorithm', 'AWS4-HMAC-SHA256');
  url.searchParams.set('X-Amz-Credential', credential);
  url.searchParams.set('X-Amz-Date', stamp);
  url.searchParams.set('X-Amz-Expires', String(expiresIn));
  url.searchParams.set('X-Amz-SignedHeaders', 'host');

  const canonicalHeaders = `host:${url.host}\n`;
  const sigInput: SignInput = {
    method: options.method,
    url,
    raw,
    credentials: options.credentials,
    now,
    signedHeaders: ['host'],
    canonicalHeaders,
    payloadHash: 'UNSIGNED-PAYLOAD',
  };
  const tts = await stringToSign(sigInput, stamp, date);
  const key = await signingKey(options.credentials, date, options.credentials.region, service);
  const signature = toHex(await hmac(key, tts));
  url.searchParams.set('X-Amz-Signature', signature);
  return url.toString();
}

/**
 * Authorization-header signing for server-side requests (HEAD/DELETE).
 * `x-amz-content-sha256` carries the real payload hash (empty body for verbs
 * without a body). Extra headers beyond `host` may be signed by the caller.
 */
export async function signRequest(options: {
  method: string;
  url: string | URL;
  credentials: AwsCredentials;
  headers?: Record<string, string>;
  body?: string | Uint8Array;
  now?: Date;
}): Promise<Record<string, string>> {
  const raw = rawUrl(options.url);
  const url = new URL(raw);
  const now = options.now ?? new Date();
  const service = options.credentials.service ?? 's3';
  const { date, stamp } = amzDates(now);

  const bodyHash = await sha256Hex(options.body ?? new Uint8Array(0));
  const headers: Record<string, string> = {
    host: url.host,
    'x-amz-content-sha256': bodyHash,
    'x-amz-date': stamp,
    ...(options.headers ?? {}),
  };

  const signedNames = [...Object.keys(headers)].map((h) => h.toLowerCase()).sort();
  const canonicalHeaders = signedNames
    .map((h) => `${h}:${(headers[h] ?? '').trim().replace(/\s+/g, ' ')}\n`)
    .join('');

  const sigInput: SignInput = {
    method: options.method,
    url,
    raw,
    credentials: options.credentials,
    now,
    signedHeaders: signedNames,
    canonicalHeaders,
    payloadHash: bodyHash,
  };
  const tts = await stringToSign(sigInput, stamp, date);
  const key = await signingKey(options.credentials, date, options.credentials.region, service);
  const signature = toHex(await hmac(key, tts));
  const credential = `${options.credentials.accessKeyId}/${date}/${options.credentials.region}/${service}/aws4_request`;

  headers.authorization = `AWS4-HMAC-SHA256 Credential=${credential}, SignedHeaders=${signedNames.join(';')}, Signature=${signature}`;
  return headers;
}
