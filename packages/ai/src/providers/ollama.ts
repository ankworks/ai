import type {
  AIModelDescriptor,
  ChatMessage,
  GatewayRequest,
  ProviderAdapter,
  StreamChunk,
} from '../index';
import { GatewayError } from '../errors';
import { DEFAULT_MODELS, resolveRegistry } from '../registry';
import { parseNdjson } from '../ndjson';

/**
 * Ollama (Cloud) adapter — native `/api/chat` streaming (NDJSON), server-held
 * API key (Authorization: Bearer), provider-agnostic StreamChunk output.
 *
 * `baseUrl` includes the `/api` suffix (default `https://ollama.com/api`) so
 * tests and self-hosted deployments can point it anywhere via OLLAMA_BASE_URL.
 */

export interface OllamaAdapterOptions {
  baseUrl: string;
  apiKey?: string | undefined;
  /** Injected for tests; defaults to global fetch. */
  fetchImpl?: typeof fetch;
}

interface OllamaStreamLine {
  message?: { content?: string; images?: string[] };
  done?: boolean;
  done_reason?: string;
  prompt_eval_count?: number;
  eval_count?: number;
  error?: string;
}

const DATA_URL_RE = /^data:image\/(png|jpe?g|webp|gif);base64,([A-Za-z0-9+/=]+)$/;
/** SSRF whitelist: images may only come from inline data: or our B2 storage. */
const ALLOWED_IMAGE_HOST_SUFFIXES = ['.backblazeb2.com'];
/** Hard byte cap per image at the adapter layer (route enforces plan limits first). */
const MAX_IMAGE_BYTES = 12 * 1024 * 1024;

function bytesToBase64(bytes: Uint8Array): string {
  let binary = '';
  const chunk = 0x8000;
  for (let i = 0; i < bytes.length; i += chunk) {
    binary += String.fromCharCode(...bytes.subarray(i, i + chunk));
  }
  return btoa(binary);
}

/**
 * ConAI image URL policy (defense: route pre-validates too):
 * inline `data:image/...;base64` or https to our Backblaze B2 storage.
 */
export function validateImageUrl(imageUrl: string): URL {
  let url: URL;
  try {
    url = new URL(imageUrl);
  } catch {
    throw new GatewayError('invalid_request', 'Invalid image URL');
  }
  const ok =
    url.protocol === 'https:' &&
    ALLOWED_IMAGE_HOST_SUFFIXES.some((suffix) => url.hostname.endsWith(suffix));
  if (!ok) {
    throw new GatewayError(
      'invalid_request',
      'Images must be an inline data URL or a ConAI storage link',
    );
  }
  return url;
}

/** Resolve image parts to Ollama's base64 `images` array (fetch injected for tests). */
async function resolveImages(
  parts: Array<{ type: string; imageUrl?: string | undefined }>,
  fetchImpl: typeof fetch,
): Promise<string[]> {
  const images: string[] = [];
  const imageParts = parts.filter((p) => p.type === 'image' && !!p.imageUrl).slice(0, 8);
  for (const part of imageParts) {
    const raw = part.imageUrl as string;
    const dataMatch = DATA_URL_RE.exec(raw);
    if (dataMatch) {
      images.push(dataMatch[2] as string);
      continue;
    }
    const url = validateImageUrl(raw);
    const res = await fetchImpl(url.toString(), { method: 'GET' });
    if (!res.ok) {
      throw new GatewayError('invalid_request', `Could not load attached image (${res.status})`);
    }
    const bytes = new Uint8Array(await res.arrayBuffer());
    if (bytes.byteLength > MAX_IMAGE_BYTES) {
      throw new GatewayError('invalid_request', 'Attached image exceeds the size limit');
    }
    images.push(bytesToBase64(bytes));
  }
  return images;
}

async function mapContent(
  content: ChatMessage['content'],
  fetchImpl: typeof fetch,
): Promise<{ content: string; images?: string[] }> {
  if (typeof content === 'string') return { content };
  const text = content.map((p) => (p.type === 'text' ? (p.text ?? '') : '')).join('\n');
  const images = await resolveImages(content, fetchImpl);
  return images.length > 0 ? { content: text, images } : { content: text };
}

function mapHttpError(status: number, detail: string): GatewayError {
  if (status === 401 || status === 403) {
    return new GatewayError('provider_auth', `Provider rejected credentials (${status})`, {
      status: 502,
    });
  }
  if (status === 429) {
    return new GatewayError('provider_rate_limit', 'Provider rate limited the request', {
      retryable: true,
    });
  }
  if (status === 404) {
    // Not present on this provider → the router's fallback chain may still
    // serve the request (bounded by the chain length; final failure surfaces).
    return new GatewayError('model_unavailable', 'Model not found on provider', {
      retryable: true,
    });
  }
  if (status === 400) {
    return new GatewayError(
      'invalid_request',
      `Provider rejected the request: ${detail.slice(0, 200)}`,
    );
  }
  return new GatewayError('network', `Provider error (${status})`, {
    retryable: true,
    status: 502,
  });
}

export function createOllamaAdapter(options: OllamaAdapterOptions): ProviderAdapter {
  const baseUrl = options.baseUrl.replace(/\/$/, '');
  // Resolve the fetch implementation PER CALL (never captured at factory time) —
  // keeps injected impls and test stubs working across adapter caches.
  const doFetch = ((...args: Parameters<typeof fetch>) =>
    (options.fetchImpl ?? globalThis.fetch)(...args)) as typeof fetch;
  const headers = (): Record<string, string> => ({
    'Content-Type': 'application/json',
    ...(options.apiKey ? { Authorization: `Bearer ${options.apiKey}` } : {}),
  });

  async function* stream(request: GatewayRequest, signal: AbortSignal): AsyncIterable<StreamChunk> {
    const mapped = [];
    for (const m of request.messages) {
      const { content, images } = await mapContent(m.content, doFetch);
      mapped.push({ role: m.role, content, ...(images ? { images } : {}) });
    }

    let response: Response;
    try {
      response = await doFetch(`${baseUrl}/chat`, {
        method: 'POST',
        headers: headers(),
        body: JSON.stringify({
          model: request.model ?? 'llama3.3:70b',
          messages: mapped,
          stream: true,
          options: {
            ...(request.options?.temperature !== undefined
              ? { temperature: request.options.temperature }
              : {}),
            ...(request.options?.maxTokens !== undefined
              ? { num_predict: request.options.maxTokens }
              : {}),
          },
        }),
        signal,
      });
    } catch (error) {
      if (error instanceof DOMException && error.name === 'AbortError') throw error;
      throw new GatewayError('network', 'Could not reach the AI provider', {
        retryable: true,
        status: 502,
      });
    }

    if (!response.ok) {
      const detail = await response.text().catch(() => '');
      throw mapHttpError(response.status, detail);
    }
    if (!response.body) {
      throw new GatewayError('network', 'Provider returned an empty body', { retryable: true });
    }

    let promptTokens = 0;
    let completionTokens = 0;
    let usageSeen = false;
    let finished = false;

    for await (const line of parseNdjson(response.body)) {
      let parsed: OllamaStreamLine;
      try {
        parsed = JSON.parse(line) as OllamaStreamLine;
      } catch {
        continue; // tolerate non-JSON keep-alives
      }
      if (parsed.error) {
        throw new GatewayError('network', `Provider error: ${parsed.error.slice(0, 200)}`, {
          retryable: true,
          status: 502,
        });
      }
      if (typeof parsed.prompt_eval_count === 'number') promptTokens = parsed.prompt_eval_count;
      if (typeof parsed.eval_count === 'number') completionTokens = parsed.eval_count;
      if (parsed.message?.content) {
        yield { type: 'text', text: parsed.message.content };
      }
      if (parsed.done) {
        finished = true;
        if (promptTokens > 0 || completionTokens > 0) {
          usageSeen = true;
          yield { type: 'usage', inputTokens: promptTokens, outputTokens: completionTokens };
        }
        yield {
          type: 'done',
          finishReason: parsed.done_reason === 'length' ? 'length' : 'stop',
        };
      }
    }

    if (!finished) {
      // Stream ended without a done frame — treat as an interrupted run.
      if (usageSeen && (promptTokens > 0 || completionTokens > 0)) {
        // usage already emitted
      }
      throw new GatewayError('network', 'Provider stream ended unexpectedly', {
        retryable: true,
        status: 502,
      });
    }
  }

  return {
    id: 'ollama_cloud',
    stream,
    async listModels(): Promise<AIModelDescriptor[]> {
      try {
        const res = await doFetch(`${baseUrl}/tags`, { headers: headers() });
        if (!res.ok) return resolveRegistry(DEFAULT_MODELS);
        const body = (await res.json()) as { models?: Array<{ name?: string }> };
        const names = (body.models ?? [])
          .map((m) => m.name)
          .filter((n): n is string => typeof n === 'string' && n.length > 0);
        if (names.length === 0) return resolveRegistry(DEFAULT_MODELS);
        return resolveRegistry(
          names.map((id) => {
            const known = DEFAULT_MODELS.find((m) => m.id === id);
            return (
              known ?? {
                id,
                provider: 'ollama_cloud',
                displayName: id.split(':')[0] ?? id,
                capabilities: ['streaming'],
                pricingMultiplier: 1,
                enabled: true,
                fallbacks: [],
                autoRank: 50,
              }
            );
          }),
        );
      } catch {
        return resolveRegistry(DEFAULT_MODELS);
      }
    },
    async health() {
      try {
        const res = await doFetch(`${baseUrl}/version`, { headers: headers() });
        return res.ok ? { ok: true } : { ok: false, detail: `HTTP ${res.status}` };
      } catch (error) {
        return { ok: false, detail: error instanceof Error ? error.message : 'unreachable' };
      }
    },
  };
}
