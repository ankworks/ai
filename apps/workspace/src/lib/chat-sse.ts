/**
 * SSE-over-POST client for `POST /api/v1/ai/chat` (EventSource cannot POST,
 * so the stream is read manually and split on event boundaries).
 */

import { apiBase, toApiError } from './api';

export interface ChatMetaEvent {
  requestId: string;
  mode: 'manual' | 'auto';
  reason: string;
  requestedModel: string;
  model: string;
  fallbackUsed: boolean;
  sparks: { hold: number; balanceAfter: number | null };
}

export type ChatServerEvent =
  | { event: 'meta'; data: ChatMetaEvent }
  | { event: 'delta'; data: { text: string } }
  | {
      event: 'usage';
      data: {
        inputTokens?: number;
        outputTokens?: number;
        sparks?: number;
        balanceAfter?: number | null;
      };
    }
  | { event: 'done'; data: { finishReason?: string; requestId?: string } }
  | { event: 'error'; data: { code?: string; message?: string; retryable?: boolean } };

export interface ChatRequestPayload {
  messages: Array<{ role: 'user' | 'assistant' | 'system'; content: string }>;
  model?: string;
}

function readCookie(name: string): string | null {
  const match = document.cookie.split('; ').find((p) => p.startsWith(`${name}=`));
  if (!match) return null;
  return decodeURIComponent(match.slice(name.length + 1));
}

async function csrfHeader(): Promise<string | null> {
  const existing = readCookie('conai_csrf');
  if (existing) return existing;
  try {
    const res = await fetch(`${apiBase()}/v1/csrf`, { credentials: 'include' });
    if (!res.ok) return null;
    const body = (await res.json()) as { token?: string };
    return body.token ?? readCookie('conai_csrf');
  } catch {
    return null;
  }
}

/**
 * Yields typed server events until the stream ends or the signal aborts.
 * Non-200 responses throw ApiError (401/402/429/503…) BEFORE any event.
 */
export async function* streamChat(
  payload: ChatRequestPayload,
  signal?: AbortSignal,
): AsyncGenerator<ChatServerEvent, void, undefined> {
  const headers = new Headers({
    'Content-Type': 'application/json',
    Accept: 'text/event-stream',
  });
  const token = await csrfHeader();
  if (token) headers.set('X-CSRF-Token', token);

  const res = await fetch(`${apiBase()}/v1/ai/chat`, {
    method: 'POST',
    headers,
    body: JSON.stringify(payload),
    credentials: 'include',
    signal,
  });
  if (!res.ok) throw await toApiError(res);
  if (!res.body) throw new Error('Empty response stream');

  const reader = res.body.getReader();
  const decoder = new TextDecoder();
  let buffer = '';
  const events: ChatServerEvent[] = [];

  const drainBlock = (block: string): ChatServerEvent | null => {
    let event = 'message';
    let data = '';
    for (const line of block.split('\n')) {
      if (line.startsWith('event: ')) event = line.slice(7).trim();
      else if (line.startsWith('data: ')) data += line.slice(6);
    }
    if (!data) return null;
    try {
      return { event, data: JSON.parse(data) } as ChatServerEvent;
    } catch {
      return null;
    }
  };

  try {
    for (;;) {
      const { done, value } = await reader.read();
      if (done) break;
      buffer += decoder.decode(value, { stream: true });
      let idx = buffer.indexOf('\n\n');
      while (idx >= 0) {
        const block = buffer.slice(0, idx);
        buffer = buffer.slice(idx + 2);
        const parsed = drainBlock(block);
        if (parsed) events.push(parsed);
        idx = buffer.indexOf('\n\n');
      }
      while (events.length > 0) yield events.shift()!;
    }
    buffer += decoder.decode();
    const tail = buffer.trim();
    if (tail) {
      const parsed = drainBlock(tail);
      if (parsed) yield parsed;
    }
    while (events.length > 0) yield events.shift()!;
  } finally {
    reader.releaseLock();
  }
}
