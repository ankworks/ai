/**
 * Phase 4 route tests — conversation history, Smart Memory (approve-to-save +
 * prompt injection), tool instructions, prompt library, and Library file routes
 * (presign/quota/confirm/download/delete with a stubbed fetch for B2).
 */

import type { DatabaseSync } from 'node:sqlite';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { createApp } from '../src/app';
import type { Env } from '../src/env';
import { createSession, makeApp, realDb } from './helpers';

const ORIGIN = 'http://localhost:5175'; // matches helpers.makeApp ALLOWED_ORIGINS

const CHAT_OK_LINES = [
  { model: 'llama3.3:70b', message: { role: 'assistant', content: 'Answer one.' }, done: false },
  {
    model: 'llama3.3:70b',
    message: { role: 'assistant', content: '' },
    done: true,
    done_reason: 'stop',
    prompt_eval_count: 8,
    eval_count: 4,
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

interface SseEvent {
  event: string;
  data: Record<string, unknown>;
}

function parseSseEvents(text: string): SseEvent[] {
  const events: SseEvent[] = [];
  for (const block of text.split('\n\n')) {
    const eventLine = block.split('\n').find((l) => l.startsWith('event: '));
    const dataLine = block.split('\n').find((l) => l.startsWith('data: '));
    if (eventLine && dataLine) {
      events.push({ event: eventLine.slice(7), data: JSON.parse(dataLine.slice(6)) });
    }
  }
  return events;
}

function chatHeaders(sessionCookie: string): Record<string, string> {
  return {
    'Content-Type': 'application/json',
    Origin: ORIGIN,
    Cookie: `${sessionCookie}; conai_csrf=csrf-phase4`,
    'X-CSRF-Token': 'csrf-phase4',
  };
}

let fetchMock: ReturnType<typeof vi.fn>;

beforeEach(() => {
  fetchMock = vi.fn(async (input: RequestInfo | URL, _init?: RequestInit) => {
    const url = String(input);
    if (url.endsWith('/chat')) return ndjsonResponse(CHAT_OK_LINES);
    // B2 HEAD/DELETE/GET (and anything else) — 200 empty object.
    return new Response('{}', { status: 200, headers: { 'Content-Type': 'application/json' } });
  });
  vi.stubGlobal('fetch', fetchMock);
});
afterEach(() => {
  vi.unstubAllGlobals();
});

function sentChatBody(callIndex: number): {
  messages: Array<{ role: string; content: string; images?: string[] }>;
} {
  // Index over provider /chat calls only (B2 image GETs / HEAD / DELETE don't count).
  const chatCalls = fetchMock.mock.calls.filter((call) => String(call[0]).endsWith('/chat'));
  const call = chatCalls.at(callIndex);
  const init = (call?.[1] as RequestInit | undefined) ?? undefined;
  return JSON.parse(String(init?.body ?? '{}')) as ReturnType<typeof sentChatBody>;
}

const AI_ENV = {
  OLLAMA_API_KEY: 'test-key',
  OLLAMA_BASE_URL: 'https://mock.llama.test/api',
};

const B2_ENV = {
  B2_APP_KEY_ID: 'test-key-id',
  B2_APP_KEY: 'test-app-key',
  B2_BUCKET_REGION: 'us-west-002',
};

interface Harness {
  app: ReturnType<typeof createApp>;
  env: Env;
  sqlite: DatabaseSync;
  cookie: string;
  userId: string;
}

async function harness(envOverrides: Partial<Record<string, string>> = {}): Promise<Harness> {
  const { db, sqlite } = realDb();
  const { app, env } = makeApp({ ...AI_ENV, ...envOverrides }, { DB: db });
  const { cookie, userId } = await createSession(app, env, sqlite, {
    email: `p4-${Math.random().toString(36).slice(2)}@conai.test`,
    username: `p4${Math.random().toString(36).slice(2, 9)}`,
  });
  sqlite
    .prepare('UPDATE spark_wallets SET balance = 500, last_refill_at = ? WHERE user_id = ?')
    .run(new Date().toISOString(), userId);
  return { app, env, sqlite, cookie, userId };
}

async function sendChat(
  h: Harness,
  body: Record<string, unknown>,
): Promise<{ status: number; events: SseEvent[]; text: string; json: () => Promise<unknown> }> {
  const res = await h.app.request(
    '/api/v1/ai/chat',
    { method: 'POST', headers: chatHeaders(h.cookie), body: JSON.stringify(body) },
    h.env,
  );
  if (res.status !== 200)
    return { status: res.status, events: [], text: '', json: () => res.json() };
  const text = await res.text();
  return { status: res.status, events: parseSseEvents(text), text, json: () => res.json() };
}

describe('conversation history', () => {
  it('persists a delivered turn and exposes it in list/detail', async () => {
    const h = await harness();
    const run = await sendChat(h, { messages: [{ role: 'user', content: 'Hello history' }] });
    expect(run.status).toBe(200);

    const done = run.events.find((e) => e.event === 'done')?.data as {
      conversationId: string | null;
    };
    expect(done.conversationId).toBeTruthy();

    // list
    const listRes = await h.app.request(
      '/api/v1/ai/conversations',
      { headers: chatHeaders(h.cookie) },
      h.env,
    );
    expect(listRes.status).toBe(200);
    const list = (await listRes.json()) as {
      conversations: Array<{ id: string; title: string; message_count: number }>;
    };
    expect(list.conversations).toHaveLength(1);
    expect(list.conversations[0]?.title).toContain('Hello history');
    expect(list.conversations[0]?.message_count).toBe(2);

    // detail: user + assistant rows with usage
    const detailRes = await h.app.request(
      `/api/v1/ai/conversations/${done.conversationId}`,
      { headers: chatHeaders(h.cookie) },
      h.env,
    );
    expect(detailRes.status).toBe(200);
    const detail = (await detailRes.json()) as {
      messages: Array<{
        role: string;
        content: string;
        sparks: number | null;
        model: string | null;
      }>;
    };
    expect(detail.messages).toHaveLength(2);
    expect(detail.messages[0]).toMatchObject({ role: 'user', content: 'Hello history' });
    expect(detail.messages[1]?.role).toBe('assistant');
    expect(detail.messages[1]?.model).toBe('llama3.3:70b');
    expect(detail.messages[1]?.sparks).toBe(1); // ceil((8+4)/100)=1
  });

  it('appends to an existing conversation (message_count grows) and supports search/pin/delete', async () => {
    const h = await harness();
    const first = await sendChat(h, {
      messages: [{ role: 'user', content: 'First turn about kites' }],
    });
    const convId = (
      first.events.find((e) => e.event === 'done')?.data as { conversationId: string }
    ).conversationId;

    const second = await sendChat(h, {
      messages: [
        { role: 'user', content: 'First turn about kites' },
        { role: 'assistant', content: 'Answer one.' },
        { role: 'user', content: 'Second turn' },
      ],
      conversationId: convId,
    });
    expect(second.status).toBe(200);

    const detail = (await (
      await h.app.request(
        `/api/v1/ai/conversations/${convId}`,
        { headers: chatHeaders(h.cookie) },
        h.env,
      )
    ).json()) as { messages: unknown[]; conversation: { message_count: number } };
    expect(detail.conversation.message_count).toBe(4);
    expect(detail.messages).toHaveLength(4);

    // search hits both title and user message content
    const search = (await (
      await h.app.request(
        '/api/v1/ai/conversations?q=kites',
        { headers: chatHeaders(h.cookie) },
        h.env,
      )
    ).json()) as { conversations: unknown[] };
    expect(search.conversations).toHaveLength(1);
    const noHit = (await (
      await h.app.request(
        '/api/v1/ai/conversations?q=zzz-nothing',
        { headers: chatHeaders(h.cookie) },
        h.env,
      )
    ).json()) as { conversations: unknown[] };
    expect(noHit.conversations).toHaveLength(0);

    // pin + rename
    const patch = await h.app.request(
      `/api/v1/ai/conversations/${convId}`,
      {
        method: 'PATCH',
        headers: chatHeaders(h.cookie),
        body: JSON.stringify({ pinned: true, title: 'Renamed thread' }),
      },
      h.env,
    );
    expect(patch.status).toBe(200);
    const patched = (await patch.json()) as { conversation: { pinned: number; title: string } };
    expect(patched.conversation.pinned).toBe(1);
    expect(patched.conversation.title).toBe('Renamed thread');

    // delete removes thread AND messages (explicit, no FK reliance)
    const del = await h.app.request(
      `/api/v1/ai/conversations/${convId}`,
      { method: 'DELETE', headers: chatHeaders(h.cookie) },
      h.env,
    );
    expect(del.status).toBe(204);
    const remaining = h.sqlite.prepare('SELECT COUNT(*) AS c FROM messages').get() as { c: number };
    expect(remaining.c).toBe(0);
  });

  it('rejects a conversationId owned by someone else', async () => {
    const h1 = await harness();
    const h2 = await harness();
    const run = await sendChat(h1, { messages: [{ role: 'user', content: 'mine' }] });
    const convId = (run.events.find((e) => e.event === 'done')?.data as { conversationId: string })
      .conversationId;
    const res = await h2.app.request(
      '/api/v1/ai/chat',
      {
        method: 'POST',
        headers: chatHeaders(h2.cookie),
        body: JSON.stringify({
          messages: [{ role: 'user', content: 'x' }],
          conversationId: convId,
        }),
      },
      h2.env,
    );
    expect(res.status).toBe(404);
  });
});

describe('Smart Memory', () => {
  it('model-sourced entries start suggested and only approved ones reach the prompt', async () => {
    const h = await harness();

    // save-from-chat → suggested (needs approval, spec §8)
    const created = await h.app.request(
      '/api/v1/ai/memory',
      {
        method: 'POST',
        headers: chatHeaders(h.cookie),
        body: JSON.stringify({
          content: 'User prefers TypeScript over JavaScript',
          source: 'model',
          sourceMessageId: 'msg-1',
        }),
      },
      h.env,
    );
    expect(created.status).toBe(201);
    const mem = ((await created.json()) as { memory: { id: string; status: string } }).memory;
    expect(mem.status).toBe('suggested');

    // first chat: memory NOT injected
    const c1 = await sendChat(h, { messages: [{ role: 'user', content: 'hi' }] });
    expect(c1.status).toBe(200);
    const body1 = sentChatBody(0);
    expect(body1.messages[0]?.role).toBe('system');
    expect(body1.messages[0]?.content).not.toContain('TypeScript over JavaScript');

    // approve
    const patch = await h.app.request(
      `/api/v1/ai/memory/${mem.id}`,
      {
        method: 'PATCH',
        headers: chatHeaders(h.cookie),
        body: JSON.stringify({ status: 'approved' }),
      },
      h.env,
    );
    expect(patch.status).toBe(200);

    // second chat: memory IS injected in the server-built system prompt
    await sendChat(h, { messages: [{ role: 'user', content: 'again' }] });
    const body2 = sentChatBody(-1);
    expect(body2.messages[0]?.role).toBe('system');
    expect(body2.messages[0]?.content).toContain('TypeScript over JavaScript');
    expect(body2.messages[0]?.content).toContain('personal memories');
  });

  it('manual entries are approved immediately; disable stops injection; delete-all clears', async () => {
    const h = await harness();
    const manual = await h.app.request(
      '/api/v1/ai/memory',
      {
        method: 'POST',
        headers: chatHeaders(h.cookie),
        body: JSON.stringify({ content: 'Works at Acme Corp', source: 'user' }),
      },
      h.env,
    );
    expect(manual.status).toBe(201);
    const mem = ((await manual.json()) as { memory: { id: string; status: string } }).memory;
    expect(mem.status).toBe('approved');

    await sendChat(h, { messages: [{ role: 'user', content: 'remember' }] });
    expect(sentChatBody(-1).messages[0]?.content).toContain('Works at Acme Corp');

    // disable → no longer injected
    await h.app.request(
      `/api/v1/ai/memory/${mem.id}`,
      { method: 'PATCH', headers: chatHeaders(h.cookie), body: JSON.stringify({ enabled: false }) },
      h.env,
    );
    await sendChat(h, { messages: [{ role: 'user', content: 'forget?' }] });
    expect(sentChatBody(-1).messages[0]?.content).not.toContain('Works at Acme Corp');

    // delete-all
    const del = await h.app.request(
      '/api/v1/ai/memory',
      { method: 'DELETE', headers: chatHeaders(h.cookie) },
      h.env,
    );
    expect(del.status).toBe(200);
    const list = (await (
      await h.app.request('/api/v1/ai/memory', { headers: chatHeaders(h.cookie) }, h.env)
    ).json()) as { memories: unknown[] };
    expect(list.memories).toHaveLength(0);
  });
});

describe('tool instructions', () => {
  it('maps the tool id to server-owned instructions (never client text)', async () => {
    const h = await harness();
    const run = await sendChat(h, {
      messages: [{ role: 'user', content: 'Explain closures' }],
      tool: 'coding',
    });
    expect(run.status).toBe(200);
    const body = sentChatBody(0);
    expect(body.messages[0]?.content).toContain('Coding mode');
    expect(body.messages[0]?.content).toContain('child sexual exploitation'); // core safety

    // persisted on the conversation for continuity
    const list = (await (
      await h.app.request('/api/v1/ai/conversations', { headers: chatHeaders(h.cookie) }, h.env)
    ).json()) as { conversations: Array<{ tool: string | null }> };
    expect(list.conversations[0]?.tool).toBe('coding');
  });
});

describe('prompt library', () => {
  it('CRUD round-trip with ownership enforcement', async () => {
    const h = await harness();
    const created = await h.app.request(
      '/api/v1/ai/prompts',
      {
        method: 'POST',
        headers: chatHeaders(h.cookie),
        body: JSON.stringify({
          title: 'Summarizer',
          body: 'Summarize the following in 5 bullets:',
        }),
      },
      h.env,
    );
    expect(created.status).toBe(201);
    const prompt = ((await created.json()) as { prompt: { id: string } }).prompt;

    const list = (await (
      await h.app.request('/api/v1/ai/prompts', { headers: chatHeaders(h.cookie) }, h.env)
    ).json()) as {
      prompts: unknown[];
    };
    expect(list.prompts).toHaveLength(1);

    const patched = await h.app.request(
      `/api/v1/ai/prompts/${prompt.id}`,
      {
        method: 'PATCH',
        headers: chatHeaders(h.cookie),
        body: JSON.stringify({ title: 'Better Summarizer' }),
      },
      h.env,
    );
    expect(patched.status).toBe(200);

    const other = await harness();
    const cross = await other.app.request(
      `/api/v1/ai/prompts/${prompt.id}`,
      { method: 'PATCH', headers: chatHeaders(other.cookie), body: JSON.stringify({ title: 'x' }) },
      other.env,
    );
    expect(cross.status).toBe(404);

    const del = await h.app.request(
      `/api/v1/ai/prompts/${prompt.id}`,
      { method: 'DELETE', headers: chatHeaders(h.cookie) },
      h.env,
    );
    expect(del.status).toBe(204);
  });
});

describe('library files (B2 presign flow)', () => {
  it('answers 503 not_configured without B2 keys', async () => {
    const h = await harness(); // no B2_* env
    const res = await h.app.request(
      '/api/v1/files/presign',
      {
        method: 'POST',
        headers: chatHeaders(h.cookie),
        body: JSON.stringify({ filename: 'a.png', sizeBytes: 1000, mimeType: 'image/png' }),
      },
      h.env,
    );
    expect(res.status).toBe(503);
    expect(((await res.json()) as { error: { code: string } }).error.code).toBe('not_configured');
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it('presigns a valid upload, confirms via HEAD, then serves a signed GET', async () => {
    const h = await harness(B2_ENV);
    const presign = await h.app.request(
      '/api/v1/files/presign',
      {
        method: 'POST',
        headers: chatHeaders(h.cookie),
        body: JSON.stringify({
          filename: 'diagram one.png',
          sizeBytes: 4096,
          mimeType: 'image/png',
        }),
      },
      h.env,
    );
    expect(presign.status).toBe(201);
    const body = (await presign.json()) as {
      file: { id: string; status: string; storage_key: string; filename: string };
      uploadUrl: string;
      method: string;
    };
    expect(body.method).toBe('PUT');
    expect(body.file.status).toBe('pending');
    expect(body.file.filename).toBe('diagram_one.png'); // sanitized
    expect(body.file.storage_key).toContain(body.file.id === '' ? '' : '/'); // uuid path
    const uploadUrl = new URL(body.uploadUrl);
    expect(uploadUrl.host).toBe('s3.us-west-002.backblazeb2.com');
    expect(uploadUrl.searchParams.get('X-Amz-Signature')).toMatch(/^[0-9a-f]{64}$/);
    expect(uploadUrl.searchParams.get('X-Amz-Expires')).toBe('900');

    // confirm → HEAD (stubbed 200) → stored
    const confirm = await h.app.request(
      `/api/v1/files/${body.file.id}/confirm`,
      { method: 'POST', headers: chatHeaders(h.cookie) },
      h.env,
    );
    expect(confirm.status).toBe(200);
    const confirmed = (await confirm.json()) as { file: { status: string; stored_at: string } };
    expect(confirmed.file.status).toBe('stored');
    expect(confirmed.file.stored_at).toBeTruthy();

    // list + usage
    const list = (await (
      await h.app.request('/api/v1/files', { headers: chatHeaders(h.cookie) }, h.env)
    ).json()) as {
      files: unknown[];
      usage: { usedBytes: number; limitBytes: number | null };
    };
    expect(list.files).toHaveLength(1);
    expect(list.usage.usedBytes).toBe(4096);
    expect(list.usage.limitBytes).toBe(500 * 1024 * 1024);

    // signed download
    const download = await h.app.request(
      `/api/v1/files/${body.file.id}`,
      { headers: chatHeaders(h.cookie) },
      h.env,
    );
    expect(download.status).toBe(200);
    const dl = (await download.json()) as { downloadUrl: string; expiresIn: number };
    expect(new URL(dl.downloadUrl).searchParams.get('X-Amz-Signature')).toMatch(/^[0-9a-f]{64}$/);

    // delete → signed DELETE to B2 (stub 200) + row gone
    const del = await h.app.request(
      `/api/v1/files/${body.file.id}`,
      { method: 'DELETE', headers: chatHeaders(h.cookie) },
      h.env,
    );
    expect(del.status).toBe(204);
    const after = h.sqlite.prepare('SELECT COUNT(*) AS c FROM files').get() as { c: number };
    expect(after.c).toBe(0);
    // the DELETE actually reached storage (signed headers present)
    const deleteCall = fetchMock.mock.calls.find(
      (call) =>
        String(call[0]).includes('diagram_one.png') &&
        (call[1] as RequestInit)?.method === 'DELETE',
    );
    expect(deleteCall).toBeTruthy();
    expect(new Headers((deleteCall?.[1] as RequestInit).headers).get('authorization')).toContain(
      'AWS4-HMAC-SHA256',
    );
  });

  it('enforces extension allow-list, per-file size cap, and byte quota', async () => {
    const h = await harness(B2_ENV);

    const badExt = await h.app.request(
      '/api/v1/files/presign',
      {
        method: 'POST',
        headers: chatHeaders(h.cookie),
        body: JSON.stringify({
          filename: 'evil.exe',
          sizeBytes: 10,
          mimeType: 'application/x-msdownload',
        }),
      },
      h.env,
    );
    expect(badExt.status).toBe(400);
    expect(((await badExt.json()) as { error: { code: string } }).error.code).toBe(
      'unsupported_file',
    );

    const tooBig = await h.app.request(
      '/api/v1/files/presign',
      {
        method: 'POST',
        headers: chatHeaders(h.cookie),
        body: JSON.stringify({
          filename: 'huge.png',
          sizeBytes: 11 * 1024 * 1024,
          mimeType: 'image/png',
        }),
      },
      h.env,
    );
    expect(tooBig.status).toBe(413);

    // shrink the plan quota to force quota_exceeded (1 MB)
    h.sqlite
      .prepare('UPDATE plan_configs SET personal_storage_mb = 1 WHERE id = ?')
      .run('personal');
    const overQuota = await h.app.request(
      '/api/v1/files/presign',
      {
        method: 'POST',
        headers: chatHeaders(h.cookie),
        body: JSON.stringify({
          filename: 'ok.png',
          sizeBytes: 2 * 1024 * 1024,
          mimeType: 'image/png',
        }),
      },
      h.env,
    );
    expect(overQuota.status).toBe(400);
    expect(((await overQuota.json()) as { error: { code: string } }).error.code).toBe(
      'quota_exceeded',
    );
  });
});

describe('chat images', () => {
  it('accepts ConAI-storage image URLs and passes base64 images to the provider', async () => {
    const h = await harness();
    const run = await sendChat(h, {
      messages: [
        {
          role: 'user',
          content: [
            { type: 'text', text: 'what is this?' },
            {
              type: 'image',
              imageUrl: 'https://s3.us-west-002.backblazeb2.com/conai-personal/u/x/img.png',
            },
          ],
        },
      ],
      model: 'gemma3:27b',
    });
    expect(run.status).toBe(200);
    const body = sentChatBody(0);
    expect(body.messages.at(-1)?.images?.length).toBe(1);
    expect(body.messages.at(-1)?.images?.[0]).toBeTypeOf('string');
  });

  it('rejects foreign image URLs before reserving (SSRF guard)', async () => {
    const h = await harness();
    const res = await h.app.request(
      '/api/v1/ai/chat',
      {
        method: 'POST',
        headers: chatHeaders(h.cookie),
        body: JSON.stringify({
          messages: [
            {
              role: 'user',
              content: [{ type: 'image', imageUrl: 'https://evil.example/x.png' }],
            },
          ],
        }),
      },
      h.env,
    );
    expect(res.status).toBe(400);
    const ledger = h.sqlite.prepare('SELECT COUNT(*) AS c FROM spark_transactions').get() as {
      c: number;
    };
    expect(ledger.c).toBe(0); // nothing reserved
    expect(fetchMock).not.toHaveBeenCalled();
  });
});
