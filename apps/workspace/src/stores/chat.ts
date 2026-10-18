/**
 * Chat conversation state (zustand): message list, active stream, abort control.
 * Server events drive the UI through `send()`; wallet/me data stays in
 * react-query (refetched by the page after each run).
 */

import { create } from 'zustand';
import { streamChat, type ChatMetaEvent } from '../lib/chat-sse';
import { ApiError } from '../lib/api';

export interface ChatMessage {
  id: string;
  role: 'user' | 'assistant';
  content: string;
  /** Set when the stream ended with a server-side error event. */
  errorCode?: string;
}

export interface ChatState {
  messages: ChatMessage[];
  model: string | undefined;
  isStreaming: boolean;
  /** Last run's server meta (model actually used, fallback flag, …). */
  lastMeta: ChatMetaEvent | null;
  lastUsage: { sparks?: number; inputTokens?: number; outputTokens?: number } | null;
  /** API-level failure (ApiError) from the last run, cleared on next send. */
  error: { status: number; code: string; message: string } | null;
  setModel: (model: string | undefined) => void;
  clear: () => void;
  stop: () => void;
  send: (text: string) => Promise<void>;
}

const newId = () => crypto.randomUUID();

export const useChatStore = create<ChatState>((set, get) => {
  let controller: AbortController | null = null;

  return {
    messages: [],
    model: undefined,
    isStreaming: false,
    lastMeta: null,
    lastUsage: null,
    error: null,

    setModel: (model) => set({ model }),

    clear: () => {
      controller?.abort();
      controller = null;
      set({
        messages: [],
        isStreaming: false,
        lastMeta: null,
        lastUsage: null,
        error: null,
      });
    },

    stop: () => {
      controller?.abort();
      controller = null;
      set({ isStreaming: false });
    },

    send: async (text) => {
      const trimmed = text.trim();
      if (!trimmed || get().isStreaming) return;

      const userMsg: ChatMessage = { id: newId(), role: 'user', content: trimmed };
      const assistantId = newId();
      const history = [...get().messages, userMsg];

      set({
        messages: [...history, { id: assistantId, role: 'assistant', content: '' }],
        isStreaming: true,
        error: null,
        lastMeta: null,
        lastUsage: null,
      });

      controller = new AbortController();
      const patchAssistant = (fn: (m: ChatMessage) => ChatMessage) =>
        set((s) => ({
          messages: s.messages.map((m) => (m.id === assistantId ? fn(m) : m)),
        }));

      try {
        const payload = {
          messages: history.map((m) => ({ role: m.role, content: m.content })),
          ...(get().model ? { model: get().model } : {}),
        };
        for await (const ev of streamChat(payload, controller.signal)) {
          if (ev.event === 'meta') {
            set({ lastMeta: ev.data });
          } else if (ev.event === 'delta') {
            patchAssistant((m) => ({ ...m, content: m.content + ev.data.text }));
          } else if (ev.event === 'usage') {
            set({
              lastUsage: {
                ...(ev.data.sparks !== undefined ? { sparks: ev.data.sparks } : {}),
                ...(ev.data.inputTokens !== undefined ? { inputTokens: ev.data.inputTokens } : {}),
                ...(ev.data.outputTokens !== undefined
                  ? { outputTokens: ev.data.outputTokens }
                  : {}),
              },
            });
          } else if (ev.event === 'error') {
            patchAssistant((m) => ({ ...m, errorCode: ev.data.code ?? 'stream_error' }));
          }
        }
      } catch (error) {
        if (error instanceof ApiError) {
          set({ error: { status: error.status, code: error.code, message: error.message } });
          // Drop the empty assistant bubble — nothing was delivered.
          set((s) => ({
            messages: s.messages.filter((m) => !(m.id === assistantId && m.content === '')),
          }));
        } else if (!(error instanceof DOMException && error.name === 'AbortError')) {
          set({
            error: {
              status: 0,
              code: 'network',
              message: error instanceof Error ? error.message : 'Network error',
            },
          });
          set((s) => ({
            messages: s.messages.filter((m) => !(m.id === assistantId && m.content === '')),
          }));
        }
      } finally {
        controller = null;
        set({ isStreaming: false });
      }
    },
  };
});
