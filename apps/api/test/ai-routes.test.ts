/**
 * AI Gateway route tests (Phase 3) — a stubbed `fetch` plays the provider, the
 * real SQLite harness runs the wallet ledger, and SSE events are asserted
 * end-to-end through the Hono app (no network, no Ollama).
 */

import type { DatabaseSync } from 'node:sqlite';
import { afterEach, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';
import type { createApp } from '../src/app';
import type { Env } from '../src/env';
import { createSession, fakeKv, makeApp, realDb } from './helpers';

const ORIGIN = 'http://localhost:5175';

const CHAT_OK_LINES = [
  { model: 'llama3.3:70b', message: { role: 'assistant', content: 'Hello' }, done: false },
  { model: 'llama3.3:70b', message: { role: 'assistant', content: ' world' }, done: false },
  {
    model: 'llama3.3:70b',
    message: { role: 'assistant', content: '' },
    done: true,
    done_reason: 'stop',
    prompt_eval_count: 10,
    eval_count: 5,
  },
];

function ndjsonResponse(lines: unknown[]): Response {
  const encoder = new TextEncoder();
  const body = new ReadableStream<Uint8Array>({
    start(controller) {
      for (const line of lines) controller.enqueue(encoder.encode(`${JSON.stringify(line)}\n`));
      controller.close();
    },
  });
  return new Response(body, { status: 200, headers: { 'Content-Type': 'application/x-ndjson' } });
}

let fetchMock: ReturnType<typeof vi.fn>;

function stubProvider(): void {
  fetchMock = vi.fn(async (input: RequestInfo | URL, init?: RequestInit) => {
    const url = String(input);
    let model = '';
    try {
      model = String((JSON.parse(String(init?.body ?? '{}')) as { model?: string }).model ?? '');
    } catch {
      /* ignore */
    }
    if (url.endsWith('/chat') && model.startsWith('missing')) {
      return new Response(JSON.stringify({ error: 'model not found' }), {
        status: 404,
        headers: { 'Content-Type': 'application/json' },
      });
    }
    if (url.endsWith('/chat')) return ndjsonResponse(CHAT_OK_LINES);
    return new Response('{}', { status: 200, headers: { 'Content-Type': 'application/json' } });
  });
  vi.stubGlobal('fetch', fetchMock);
}

function chatHeaders(sessionCookie: string): Record<string, string> {
  return {
    'Content-Type': 'application/json',
    Origin: ORIGIN,
    Cookie: `${sessionCookie}; conai_csrf=csrf-test-token`,
    'X-CSRF-Token': 'csrf-test-token',
  };
}

function parseSseEvents(text: string): Array<{ event: string; data: Record<string, unknown> }> {
  const events: Array<{ event: string; data: Record<string, unknown> }> = [];
  for (const block of text.split('\n\n')) {
    const eventLine = block.split('\n').find((l) => l.startsWith('event: '));
    const dataLine = block.split('\n').find((l) => l.startsWith('data: '));
    if (eventLine && dataLine) {
      events.push({
        event: eventLine.slice(7),
        data: JSON.parse(dataLine.slice(6)) as Record<string, unknown>,
      });
    }
  }
  return events;
}

interface Harness {
  app: ReturnType<typeof createApp>;
  env: Env;
  sqlite: DatabaseSync;
  cookie: string;
  userId: string;
}

async function harnessWithSession(
  bindings: Partial<Env> = {},
  envOverrides: Partial<Record<string, string>> = {},
): Promise<Harness> {
  const { db, sqlite } = realDb();
  const { app, env } = makeApp(envOverrides, { DB: db, ...bindings });
  const { cookie, userId } = await createSession(app, env, sqlite, {
    email: `ai-${Math.random().toString(36).slice(2)}@conai.test`,
    username: `aitest${Math.random().toString(36).slice(2, 9)}`,
  });
  sqlite
    .prepare('UPDATE spark_wallets SET balance = 500, last_refill_at = ? WHERE user_id = ?')
    .run(new Date().toISOString(), userId);
  return { app, env, sqlite, cookie, userId };
}

const AI_ENV = {
  OLLAMA_API_KEY: 'test-provider-key',
  OLLAMA_BASE_URL: 'https://mock.llama.test/api',
};

beforeEach(() => {
  stubProvider();
});
afterEach(() => {
  vi.unstubAllGlobals();
});

let shared: Harness;
let sharedCookie: string;

beforeAll(async () => {
  shared = await harnessWithSession({}, AI_ENV);
  sharedCookie = shared.cookie;
});

describe('GET /api/v1/models', () => {
  it('returns the public catalog with the auto entry', async () => {
    const res = await shared.app.request('/api/v1/models', {}, shared.env);
    expect(res.status).toBe(200);
    const body = (await res.json()) as {
      auto: { id: string };
      models: Array<{ id: string; capabilities: string[] }>;
    };
    expect(body.auto.id).toBe('conai-auto');
    const ids = body.models.map((m) => m.id);
    expect(ids).toEqual(expect.arrayContaining(['llama3.3:70b', 'llama3.1:8b']));
    expect(body.models.every((m) => m.capabilities.length > 0)).toBe(true);
  });
});

describe('POST /api/v1/ai/chat', () => {
  it('rejects unauthenticated requests before touching the provider', async () => {
    const res = await shared.app.request(
      '/api/v1/ai/chat',
      {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Origin: ORIGIN,
          Cookie: 'conai_csrf=csrf-test-token',
          'X-CSRF-Token': 'csrf-test-token',
        },
        body: JSON.stringify({ messages: [{ role: 'user', content: 'Hi' }] }),
      },
      shared.env,
    );
    expect(res.status).toBe(401);
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it('streams SSE, charges provider-verified usage, and settles the ledger', async () => {
    const res = await shared.app.request(
      '/api/v1/ai/chat',
      {
        method: 'POST',
        headers: chatHeaders(sharedCookie),
        body: JSON.stringify({
          messages: [{ role: 'user', content: 'Hi' }],
          model: 'llama3.3:70b',
        }),
      },
      shared.env,
    );
    expect(res.status).toBe(200);
    expect(res.headers.get('content-type')).toContain('text/event-stream');

    const text = await res.text();
    const events = parseSseEvents(text);
    const kinds = events.map((e) => e.event);
    expect(kinds[0]).toBe('meta');
    expect(kinds).toContain('delta');
    expect(kinds).toContain('usage');
    expect(kinds.at(-1)).toBe('done');

    const meta = events[0]?.data as {
      model: string;
      fallbackUsed: boolean;
      sparks: { hold: number; balanceAfter: number };
    };
    expect(meta.model).toBe('llama3.3:70b');
    expect(meta.fallbackUsed).toBe(false);
    expect(meta.sparks.hold).toBeGreaterThan(0);

    const deltas = events.filter((e) => e.event === 'delta');
    expect(deltas.map((e) => (e.data as { text: string }).text).join('')).toBe('Hello world');

    const usage = events.find((e) => e.event === 'usage')?.data as {
      inputTokens: number;
      outputTokens: number;
      sparks: number;
      balanceAfter: number;
    };
    // provider reported 10 prompt + 5 completion → ceil((10+5)/100)=1 Spark
    expect(usage.inputTokens).toBe(10);
    expect(usage.outputTokens).toBe(5);
    expect(usage.sparks).toBe(1);
    expect(usage.balanceAfter).toBe(499);

    // Provider was called exactly once with the server-held key.
    expect(fetchMock.mock.calls.map((c) => String(c[0]))).toEqual([
      'https://mock.llama.test/api/chat',
    ]);
    const [url, init] = fetchMock.mock.calls[0] as [string, RequestInit];
    expect(url).toBe('https://mock.llama.test/api/chat');
    expect(new Headers(init.headers).get('Authorization')).toBe('Bearer test-provider-key');

    // Ledger: reservation + settlement, wallet debited by settled amount only.
    const wallet = shared.sqlite
      .prepare('SELECT balance FROM spark_wallets WHERE user_id = ?')
      .get(shared.userId) as { balance: number } | undefined;
    expect(wallet?.balance).toBe(499);
    const settlements = shared.sqlite
      .prepare("SELECT * FROM spark_transactions WHERE type = 'settlement'")
      .all() as Array<{ request_id: string; amount: number; meta: string }>;
    expect(settlements.length).toBeGreaterThanOrEqual(1);
    const last = settlements.at(-1)!;
    expect(last.request_id).toMatch(/^settle:/);
    const ledgerMeta = JSON.parse(last.meta) as {
      hold: number;
      actual: number;
      charged: number;
      refund: number;
    };
    // hold ≈ estimate (600 default output), actual from provider usage, refund = hold - charged
    expect(ledgerMeta.charged).toBe(1);
    expect(ledgerMeta.actual).toBe(1);
    expect(ledgerMeta.refund).toBe(ledgerMeta.hold - 1);
    expect(last.amount).toBe(ledgerMeta.refund); // signed ledger delta = refund
  });

  it('returns 402 insufficient_sparks without calling the provider', async () => {
    shared.sqlite
      .prepare('UPDATE spark_wallets SET balance = 0 WHERE user_id = ?')
      .run(shared.userId);
    const res = await shared.app.request(
      '/api/v1/ai/chat',
      {
        method: 'POST',
        headers: chatHeaders(sharedCookie),
        body: JSON.stringify({ messages: [{ role: 'user', content: 'Hi' }], model: 'llama3.1:8b' }),
      },
      shared.env,
    );
    expect(res.status).toBe(402);
    const body = (await res.json()) as { error: { code: string } };
    expect(body.error.code).toBe('insufficient_sparks');
    expect(fetchMock).not.toHaveBeenCalled();

    // restore budget for later tests in this suite
    shared.sqlite
      .prepare('UPDATE spark_wallets SET balance = 500 WHERE user_id = ?')
      .run(shared.userId);
  });

  it('honours an idempotent requestId and rejects replays after settlement', async () => {
    const requestId = crypto.randomUUID();
    const res1 = await shared.app.request(
      '/api/v1/ai/chat',
      {
        method: 'POST',
        headers: chatHeaders(sharedCookie),
        body: JSON.stringify({
          messages: [{ role: 'user', content: 'Ping' }],
          model: 'llama3.1:8b',
          requestId,
        }),
      },
      shared.env,
    );
    expect(res1.status).toBe(200);
    await res1.text();

    const res2 = await shared.app.request(
      '/api/v1/ai/chat',
      {
        method: 'POST',
        headers: chatHeaders(sharedCookie),
        body: JSON.stringify({
          messages: [{ role: 'user', content: 'Ping again' }],
          model: 'llama3.1:8b',
          requestId,
        }),
      },
      shared.env,
    );
    expect(res2.status).toBe(409);
    const body = (await res2.json()) as { error: { code: string } };
    expect(body.error.code).toBe('invalid_request');
  });

  it('returns 503 not_configured when OLLAMA_API_KEY is absent', async () => {
    const bare = await harnessWithSession(
      {},
      { OLLAMA_BASE_URL: 'https://mock.llama.test/api' }, // no API key
    );
    fetchMock.mockClear(); // ignore any fetches from session bootstrap
    const before = (
      bare.sqlite.prepare('SELECT COUNT(*) AS c FROM spark_transactions').get() as { c: number }
    ).c;
    const res = await bare.app.request(
      '/api/v1/ai/chat',
      {
        method: 'POST',
        headers: chatHeaders(bare.cookie),
        body: JSON.stringify({ messages: [{ role: 'user', content: 'Hi' }] }),
      },
      bare.env,
    );
    expect(res.status).toBe(503);
    const body = (await res.json()) as { error: { code: string } };
    expect(body.error.code).toBe('not_configured');
    expect(fetchMock).not.toHaveBeenCalled();
    const after = (
      bare.sqlite.prepare('SELECT COUNT(*) AS c FROM spark_transactions').get() as { c: number }
    ).c;
    expect(after).toBe(before);
  });

  it('falls back to the next registry model on a retryable pre-stream failure', async () => {
    const { db, sqlite } = realDb();
    sqlite.prepare('INSERT INTO platform_settings (key, value) VALUES (?, ?)').run(
      'ai.registry',
      JSON.stringify([
        {
          id: 'missing-a',
          provider: 'ollama',
          displayName: 'Missing A',
          capabilities: ['chat'],
          pricingMultiplier: 1,
          enabled: true,
          fallbacks: ['llama3.3:70b'],
          autoRank: 1,
        },
        {
          id: 'llama3.3:70b',
          provider: 'ollama',
          displayName: 'Llama 3.3 70B',
          capabilities: ['chat'],
          pricingMultiplier: 1,
          enabled: true,
          fallbacks: [],
          autoRank: 2,
        },
      ]),
    );
    const { app, env } = makeApp(AI_ENV, { DB: db });
    const { cookie, userId } = await createSession(app, env, sqlite, {
      email: 'fallback@conai.test',
      username: 'fallback1',
    });
    sqlite
      .prepare('UPDATE spark_wallets SET balance = 500, last_refill_at = ? WHERE user_id = ?')
      .run(new Date().toISOString(), userId);

    fetchMock.mockClear(); // ignore any fetches from session bootstrap
    const res = await app.request(
      '/api/v1/ai/chat',
      {
        method: 'POST',
        headers: chatHeaders(cookie),
        body: JSON.stringify({ messages: [{ role: 'user', content: 'Hi' }] }), // no model → autoRank
      },
      env,
    );
    expect(res.status).toBe(200);
    const events = parseSseEvents(await res.text());
    const meta = events[0]?.data as {
      model: string;
      fallbackUsed: boolean;
      requestedModel: string;
    };
    expect(meta.requestedModel).toBe('missing-a');
    expect(meta.fallbackUsed).toBe(true);
    expect(meta.model).toBe('llama3.3:70b');
    // first attempt (missing-a) then fallback — provider called twice
    expect(fetchMock).toHaveBeenCalledTimes(2);

    const settlement = sqlite
      .prepare(
        "SELECT amount, meta FROM spark_transactions WHERE type = 'settlement' ORDER BY rowid DESC LIMIT 1",
      )
      .get() as { amount: number; meta: string } | undefined;
    expect(settlement).toBeTruthy();
    const settleMeta = JSON.parse(settlement!.meta) as { charged: number };
    expect(settleMeta.charged).toBe(1);
  });

  it('enforces the per-user chat rate limit (429 + Retry-After)', async () => {
    const { binding } = fakeKv();
    const h = await harnessWithSession({ CACHE: binding } as Partial<Env>, AI_ENV);

    let sawLimit = false;
    for (let i = 0; i < 33; i++) {
      const res = await h.app.request(
        '/api/v1/ai/chat',
        {
          method: 'POST',
          headers: chatHeaders(h.cookie),
          body: JSON.stringify({
            messages: [{ role: 'user', content: `m${i}` }],
            model: 'llama3.1:8b',
          }),
        },
        h.env,
      );
      if (res.status === 429) {
        expect(res.headers.get('retry-after')).toBeTruthy();
        sawLimit = true;
        break;
      }
      expect(res.status).toBe(200);
      await res.text();
    }
    expect(sawLimit).toBe(true);
  }, 30_000);

  it('rejects invalid payloads before reserving', async () => {
    const res = await shared.app.request(
      '/api/v1/ai/chat',
      {
        method: 'POST',
        headers: chatHeaders(sharedCookie),
        body: JSON.stringify({ messages: [] }),
      },
      shared.env,
    );
    expect(res.status).toBe(400);
    const body = (await res.json()) as { error: { code: string } };
    expect(body.error.code).toBe('invalid_request');
    expect(fetchMock).not.toHaveBeenCalled();
  });
});
