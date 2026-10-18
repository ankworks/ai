/**
 * AI Gateway routes (spec §6 + §7):
 *   GET  /api/v1/models    — public model catalog (no secrets, no keys)
 *   POST /api/v1/ai/chat   — session-gated SSE chat with reserve → settle → refund
 *
 * Invariants: server-held provider key; per-user KV rate limit; Sparks hold is
 * taken BEFORE the provider is called and always finalized (settled/released)
 * exactly once — success, mid-stream failure, client abort, or pre-stream error.
 */

import type { Hono } from 'hono';
import { z } from 'zod';
import {
  AI_REGISTRY_SETTING_KEY,
  DEFAULT_MODELS,
  GatewayError,
  estimateRequestSparks,
  resolveRegistry,
  routeRequest,
  usageFromEmittedText,
  usageFromProvider,
  type AIModelDescriptor,
  type ChatMessage,
  type ProviderAdapter,
  type RoutingDecision,
  type StreamChunk,
} from '@conai/ai';
import {
  DEFAULT_PRICING,
  computeUsageSparks,
  isValidRequestId,
  type SparkPricingConfig,
} from '@conai/sparks';
import { SETTING_KEYS, parseSetting } from '@conai/database';
import { checkRateLimit, type RateLimitKV } from '@conai/auth';
import type { AppEnv } from '../env';
import { errorResponse, queueHeader } from '../middleware/security';
import { aiConfigured, getProviderAdapter } from '../ai-provider';
import { requireSession } from './me';
import { releaseSparks, reserveSparks, settleSparks } from '../services/wallet';

/** First provider chunk must arrive within this window (pre-stream HTTP errors). */
const FIRST_TOKEN_TIMEOUT_MS = 20_000;
/** Hard ceiling for one streamed response. */
const MAX_STREAM_MS = 180_000;
/** Per-user chat budget. */
const CHAT_RATE = { bucket: 'ai-chat', max: 30, windowSec: 60 };

const MAX_MESSAGES = 64;
const MAX_TEXT_CHARS = 20_000;
const MAX_IMAGES_PER_MESSAGE = 6;

const partSchema = z
  .object({
    type: z.enum(['text', 'image']),
    text: z.string().max(MAX_TEXT_CHARS).optional(),
    imageUrl: z.string().max(4_000_000).optional(),
  })
  .refine((p) => (p.type === 'text' ? (p.text ?? '').length > 0 : !!p.imageUrl), {
    message: 'part content missing',
  });

const contentSchema = z.union([
  z.string().min(1).max(MAX_TEXT_CHARS),
  z.array(partSchema).min(1).max(16),
]);

const chatBodySchema = z.object({
  messages: z
    .array(
      z.object({
        role: z.enum(['system', 'user', 'assistant']),
        content: contentSchema,
      }),
    )
    .min(1)
    .max(MAX_MESSAGES),
  model: z.string().min(1).max(100).optional(),
  requestId: z.string().max(64).optional(),
  maxTokens: z.number().int().min(1).max(4096).optional(),
  temperature: z.number().min(0).max(2).optional(),
});

type ChatBody = z.infer<typeof chatBodySchema>;

async function loadRegistry(db: D1Database | undefined): Promise<AIModelDescriptor[]> {
  if (!db) return resolveRegistry(DEFAULT_MODELS);
  try {
    const row = await db
      .prepare('SELECT value FROM platform_settings WHERE key = ?')
      .bind(AI_REGISTRY_SETTING_KEY)
      .first<{ value: string }>();
    const override = parseSetting<AIModelDescriptor[] | null>(row?.value, null);
    if (Array.isArray(override) && override.length > 0) return resolveRegistry(override);
  } catch (error) {
    console.warn('[ai] invalid ai.registry setting — using defaults:', (error as Error).message);
  }
  return resolveRegistry(DEFAULT_MODELS);
}

async function loadPricing(db: D1Database | undefined): Promise<SparkPricingConfig> {
  if (!db) return DEFAULT_PRICING;
  const row = await db
    .prepare('SELECT value FROM platform_settings WHERE key = ?')
    .bind(SETTING_KEYS.sparksPricing)
    .first<{ value: string }>();
  return parseSetting<SparkPricingConfig>(row?.value, DEFAULT_PRICING);
}

function isAbortLike(error: unknown): boolean {
  return error instanceof DOMException && error.name === 'AbortError';
}

function toGatewayError(error: unknown): GatewayError {
  if (error instanceof GatewayError) return error;
  return new GatewayError('network', 'AI provider failed', { retryable: true, status: 502 });
}

function withTimeout<T>(promise: Promise<T>, ms: number, signal: AbortSignal): Promise<T> {
  return new Promise<T>((resolve, reject) => {
    const cleanup = () => {
      clearTimeout(timer);
      signal.removeEventListener('abort', onAbort);
    };
    const onAbort = () => {
      cleanup();
      reject(new DOMException('Aborted', 'AbortError'));
    };
    const timer = setTimeout(() => {
      cleanup();
      reject(new GatewayError('network', `Model timed out after ${ms}ms`, { retryable: true }));
    }, ms);
    signal.addEventListener('abort', onAbort, { once: true });
    promise.then(
      (value) => {
        cleanup();
        resolve(value);
      },
      (error) => {
        cleanup();
        reject(error);
      },
    );
  });
}

interface OpenedStream {
  first: StreamChunk;
  rest: AsyncIterable<StreamChunk>;
  modelUsed: string;
  fallbackUsed: boolean;
}

/**
 * Get the first chunk (or fail as HTTP). On retryable failures walks the
 * fallback chain; aborts always propagate (no fallback on client cancel).
 */
async function openStream(
  adapter: ProviderAdapter,
  base: { request: Parameters<ProviderAdapter['stream']>[0]; userId: string },
  chain: string[],
  signal: AbortSignal,
): Promise<OpenedStream> {
  const models = [base.request.model as string, ...chain.filter((m) => m !== base.request.model)];
  let lastError = new GatewayError('model_unavailable', 'No model could serve this request', {
    retryable: false,
  });

  for (let i = 0; i < models.length; i++) {
    const modelId = models[i] as string;
    try {
      const iterable = adapter.stream({ ...base.request, model: modelId }, signal);
      const iterator = iterable[Symbol.asyncIterator]();
      const firstResult = await withTimeout(iterator.next(), FIRST_TOKEN_TIMEOUT_MS, signal);
      if (firstResult.done) {
        throw new GatewayError('network', 'Provider stream ended before any content', {
          retryable: true,
        });
      }
      return {
        first: firstResult.value,
        rest: {
          [Symbol.asyncIterator]: () => iterator,
        },
        modelUsed: modelId,
        fallbackUsed: i > 0,
      };
    } catch (error) {
      if (isAbortLike(error)) throw error;
      lastError = toGatewayError(error);
      if (!lastError.retryable) throw lastError;
      // retryable → try next model in the chain
    }
  }
  throw lastError;
}

function messagesToText(messages: ChatMessage[]): string {
  return messages
    .map((m) =>
      typeof m.content === 'string' ? m.content : m.content.map((p) => p.text ?? '').join(' '),
    )
    .join('\n');
}

function validateImages(messages: ChatMessage[]): void {
  for (const m of messages) {
    if (Array.isArray(m.content)) {
      const images = m.content.filter((p) => p.type === 'image');
      if (images.length > MAX_IMAGES_PER_MESSAGE) {
        throw new GatewayError(
          'invalid_request',
          `At most ${MAX_IMAGES_PER_MESSAGE} images per message`,
        );
      }
    }
  }
}

export function registerAiRoutes(app: Hono<AppEnv>): void {
  // ── Public model catalog ──────────────────────────────────────────────────
  app.get('/api/v1/models', async (c) => {
    const models = await loadRegistry(c.env.DB);
    c.header('Cache-Control', 'public, max-age=60');
    return c.json({
      auto: { id: 'conai-auto', displayName: 'ConAI Auto' },
      models: models.map((m) => ({
        id: m.id,
        displayName: m.displayName,
        description: m.description ?? null,
        capabilities: m.capabilities,
        pricingMultiplier: m.pricingMultiplier,
        enabled: m.enabled,
      })),
    });
  });

  // ── SSE chat ──────────────────────────────────────────────────────────────
  app.post('/api/v1/ai/chat', async (c) => {
    const session = await requireSession(c);
    if (!session)
      return errorResponse('unauthenticated', 'Sign in required', 401, c.get('requestId'));
    const db = c.env.DB;
    if (!db)
      return errorResponse('not_configured', 'Database unavailable', 503, c.get('requestId'));
    if (!aiConfigured(c.env)) {
      return errorResponse(
        'not_configured',
        'AI provider is not configured on this deployment (missing OLLAMA_API_KEY)',
        503,
        c.get('requestId'),
      );
    }

    // Per-user chat rate limit (KV; keyed by user, not IP — shared NATs stay fair).
    if (c.env.CACHE) {
      const limit = await checkRateLimit(
        c.env.CACHE as unknown as RateLimitKV,
        CHAT_RATE,
        `u:${session.user.id}`,
      );
      if (!limit.allowed) {
        queueHeader(c, 'Retry-After', String(limit.retryAfterSec));
        return errorResponse(
          'rate_limited',
          `Chat rate limit reached — retry in ${limit.retryAfterSec}s`,
          429,
          c.get('requestId'),
        );
      }
    }

    const raw = await c.req.json().catch(() => null);
    const parsed = chatBodySchema.safeParse(raw);
    if (!parsed.success) {
      return errorResponse('invalid_request', 'Invalid chat payload', 400, c.get('requestId'));
    }
    const body: ChatBody = parsed.data;
    const messages = body.messages as ChatMessage[];
    const totalChars = messages.reduce(
      (sum, m) =>
        sum +
        (typeof m.content === 'string'
          ? m.content.length
          : m.content.reduce((s, p) => s + (p.text?.length ?? 0) + (p.imageUrl?.length ?? 0), 0)),
      0,
    );
    if (totalChars > 100_000) {
      return errorResponse('invalid_request', 'Request too large', 400, c.get('requestId'));
    }
    try {
      validateImages(messages);
    } catch (error) {
      const g = toGatewayError(error);
      if (g.code === 'invalid_request') {
        return errorResponse('invalid_request', g.message, 400, c.get('requestId'));
      }
      throw error;
    }

    if (body.requestId && !isValidRequestId(body.requestId)) {
      return errorResponse('invalid_request', 'requestId must be a UUID', 400, c.get('requestId'));
    }
    const requestId = body.requestId ?? crypto.randomUUID();
    // A requestId whose settlement/release already happened must not run twice.
    const finalizedBefore = await db
      .prepare('SELECT id FROM spark_transactions WHERE request_id IN (?, ?) LIMIT 1')
      .bind(`settle:${requestId}`, `release:${requestId}`)
      .first<{ id: string }>();
    if (finalizedBefore) {
      return errorResponse(
        'invalid_request',
        'This requestId was already processed — use a new one for a new message',
        409,
        c.get('requestId'),
      );
    }

    const registry = await loadRegistry(db);
    let decision: RoutingDecision;
    try {
      decision = routeRequest({ requestedModel: body.model, messages, registry });
    } catch (error) {
      if (error instanceof GatewayError) {
        return errorResponse(error.code, error.message, error.status, c.get('requestId'));
      }
      throw error;
    }

    const pricing = await loadPricing(db);
    const estimate = estimateRequestSparks({
      messages,
      pricing,
      multiplier: decision.pricingMultiplier,
      expectedOutputTokens: body.maxTokens,
    });

    // ── Reserve BEFORE calling the provider ────────────────────────────────
    let reserve;
    try {
      reserve = await reserveSparks(db, {
        userId: session.user.id,
        requestId,
        hold: estimate.sparks,
        description: `chat:${decision.modelId}`,
        meta: { model: decision.modelId, mode: decision.mode },
      });
    } catch (error) {
      if (
        error &&
        typeof error === 'object' &&
        'code' in error &&
        error.code === 'insufficient_sparks'
      ) {
        return errorResponse(
          'insufficient_sparks',
          (error as unknown as Error).message,
          402,
          c.get('requestId'),
        );
      }
      throw error;
    }

    // Client abort + hard stream deadline share one controller for the provider call.
    const ctrl = new AbortController();
    const timeoutMark = Symbol('stream-timeout');
    const onClientAbort = () => ctrl.abort(c.req.raw.signal.reason);
    if (c.req.raw.signal.aborted) ctrl.abort(c.req.raw.signal.reason);
    else c.req.raw.signal.addEventListener('abort', onClientAbort, { once: true });
    const deadline = setTimeout(() => ctrl.abort(timeoutMark), MAX_STREAM_MS);

    const adapter = getProviderAdapter(c.env);
    const inputText = messagesToText(messages);

    let opened: OpenedStream;
    try {
      opened = await openStream(
        adapter,
        {
          request: {
            requestId,
            userId: session.user.id,
            model: decision.modelId,
            messages,
            options: { temperature: body.temperature, maxTokens: body.maxTokens },
          },
          userId: session.user.id,
        },
        decision.fallbackChain,
        ctrl.signal,
      );
    } catch (error) {
      clearTimeout(deadline);
      c.req.raw.signal.removeEventListener('abort', onClientAbort);
      // Nothing streamed yet → full refund.
      await releaseSparks(db, {
        userId: session.user.id,
        requestId,
        hold: reserve.hold,
        description: `chat failed: ${decision.modelId}`,
        meta: { model: decision.modelId, reason: 'pre_stream_error' },
      });
      if (isAbortLike(error)) {
        return errorResponse('client_aborted', 'Request aborted', 499, c.get('requestId'));
      }
      const g = toGatewayError(error);
      return errorResponse(g.code, g.message, g.status, c.get('requestId'));
    }

    // ── Stream response (settle exactly once in every exit path) ───────────
    const encoder = new TextEncoder();
    const userId = session.user.id;
    const hold = reserve.hold;
    let emittedText = '';
    let providerUsage: { input: number; output: number } | null = null;
    let finishReason: 'stop' | 'length' | 'cancelled' | 'error' = 'stop';
    let finalized = false;

    const finalize = async (mode: 'settle' | 'release') => {
      if (finalized) return null;
      finalized = true;
      if (mode === 'release') {
        return releaseSparks(db, {
          userId,
          requestId,
          hold,
          description: `chat released: ${opened.modelUsed}`,
          meta: { model: opened.modelUsed },
        });
      }
      const usage = providerUsage
        ? usageFromProvider(providerUsage.input, providerUsage.output)
        : usageFromEmittedText(inputText, emittedText);
      const breakdown = computeUsageSparks(usage, pricing, decision.pricingMultiplier);
      return settleSparks(db, {
        userId,
        requestId,
        hold,
        actualSparks: breakdown.totalSparks,
        description: `chat:${opened.modelUsed}`,
        meta: {
          model: opened.modelUsed,
          fallbackUsed: opened.fallbackUsed,
          finishReason,
          usage,
        },
      });
    };

    const stream = new ReadableStream<Uint8Array>({
      start(controller) {
        const send = (event: string, data: unknown) => {
          try {
            controller.enqueue(
              encoder.encode(`event: ${event}\ndata: ${JSON.stringify(data)}\n\n`),
            );
          } catch {
            /* controller already closed (client gone) */
          }
        };

        send('meta', {
          requestId,
          mode: decision.mode,
          reason: decision.reason,
          requestedModel: decision.modelId,
          model: opened.modelUsed,
          fallbackUsed: opened.fallbackUsed,
          sparks: { hold, balanceAfter: reserve.balanceAfter },
        });

        // The buffered first chunk (its arrival proved the provider is live).
        const emit = (chunk: StreamChunk) => {
          if (chunk.type === 'text') {
            emittedText += chunk.text;
            send('delta', { text: chunk.text });
          } else if (chunk.type === 'usage') {
            providerUsage = { input: chunk.inputTokens, output: chunk.outputTokens };
          } else if (chunk.type === 'done') {
            finishReason = chunk.finishReason;
          }
        };
        emit(opened.first);

        const pump = async () => {
          try {
            for await (const chunk of opened.rest) emit(chunk);
            if (ctrl.signal.aborted && ctrl.signal.reason === timeoutMark) {
              finishReason = 'error';
            }
            const settled = await finalize('settle');
            const usage = providerUsage
              ? usageFromProvider(providerUsage.input, providerUsage.output)
              : usageFromEmittedText(inputText, emittedText);
            send('usage', {
              inputTokens: usage.inputTokens,
              outputTokens: usage.outputTokens,
              sparks: settled && 'charged' in settled ? settled.charged : estimate.sparks,
              balanceAfter: settled && 'balanceAfter' in settled ? settled.balanceAfter : null,
            });
            send('done', { finishReason, requestId });
            try {
              controller.close();
            } catch {
              /* already closed */
            }
          } catch (error) {
            if (isAbortLike(error) && ctrl.signal.reason !== timeoutMark) {
              // Client went away — settle the partial usage quietly.
              await finalize('settle');
              try {
                controller.close();
              } catch {
                /* already closed */
              }
              return;
            }
            finishReason = 'error';
            await finalize('settle');
            const g = toGatewayError(error);
            const usage = usageFromEmittedText(inputText, emittedText);
            send('error', { code: g.code, message: g.message, retryable: g.retryable });
            send('usage', { inputTokens: usage.inputTokens, outputTokens: usage.outputTokens });
            try {
              controller.close();
            } catch {
              /* already closed */
            }
          } finally {
            clearTimeout(deadline);
            c.req.raw.signal.removeEventListener('abort', onClientAbort);
          }
        };
        void pump();
      },
      cancel() {
        // Client cancelled the stream — settle partial usage once.
        void finalize('settle').finally(() => {
          clearTimeout(deadline);
          c.req.raw.signal.removeEventListener('abort', onClientAbort);
        });
      },
    });

    return new Response(stream, {
      status: 200,
      headers: {
        'Content-Type': 'text/event-stream; charset=utf-8',
        'Cache-Control': 'no-cache, no-store',
        Connection: 'keep-alive',
        'X-Accel-Buffering': 'no',
      },
    });
  });
}
