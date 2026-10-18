/**
 * Chat conversation state (zustand): message list, active stream, abort control.
 * Server events drive the UI through `send()`; the conversation id comes back
 * on `done` (Phase 4 — history persisted server-side) and is sent along on
 * subsequent turns. Wallet/me data stays in react-query.
 */

import { create } from 'zustand';
import { streamChat, type ChatContent, type ChatMetaEvent } from '../lib/chat-sse';
import { ApiError } from '../lib/api';

export interface ChatMessage {
  id: string;
  role: 'user' | 'assistant';
  content: string;
  /** Image attachments shown under a user bubble (also sent as image parts). */
  images?: string[];
  /** Set when the stream ended with a server-side error event. */
  errorCode?: string;
  /** requestId of the assistant turn (used for save-to-memory). */
  requestId?: string;
}

export type ToolId = 'study' | 'coding' | 'writing' | 'documents' | 'tools';

export interface ChatState {
  messages: ChatMessage[];
  model: string | undefined;
  /** Active server-side thread (null until the first delivered turn). */
  conversationId: string | null;
  /** Active tool preset (from /chat?tool= or a History thread). */
  tool: ToolId | undefined;
  isStreaming: boolean;
  /** Last run's server meta (model actually used, fallback flag, …). */
  lastMeta: ChatMetaEvent | null;
  lastUsage: { sparks?: number; inputTokens?: number; outputTokens?: number } | null;
  /** API-level failure (ApiError) from the last run, cleared on next send. */
  error: { status: number; code: string; message: string } | null;
  setModel: (model: string | undefined) => void;
  setTool: (tool: ToolId | undefined) => void;
  /** Fresh thread: empties messages and detaches from any conversation. */
  clear: () => void;
  /** Open a stored thread (History): replace state with fetched messages. */
  openConversation: (state: {
    id: string;
    messages: ChatMessage[];
    tool?: ToolId | undefined;
  }) => void;
  stop: () => void;
  send: (text: string, imageUrls?: string[]) => Promise<void>;
}

const newId = () => crypto.randomUUID();

/**
 * Stored message content may be plain text OR the JSON of content parts
 * (image attachments are persisted as `[{"type":...}]` by the API).
 */
export function parseStoredContent(raw: string): { text: string; images: string[] } {
  if (raw.startsWith('[')) {
    try {
      const parts = JSON.parse(raw) as Array<{ type?: string; text?: string; imageUrl?: string }>;
      const text = parts
        .filter((p) => p.type === 'text')
        .map((p) => p.text ?? '')
        .join('\n')
        .trim();
      const images = parts
        .filter((p) => p.type === 'image' && p.imageUrl)
        .map((p) => p.imageUrl as string);
      if (text || images.length > 0) return { text, images };
    } catch {
      /* fall through to raw */
    }
  }
  return { text: raw, images: [] };
}

function toContent(message: ChatMessage): ChatContent {
  if (!message.images || message.images.length === 0) return message.content;
  return [
    { type: 'text', text: message.content },
    ...message.images.map((imageUrl) => ({ type: 'image' as const, imageUrl })),
  ];
}

export const useChatStore = create<ChatState>((set, get) => {
  let controller: AbortController | null = null;

  return {
    messages: [],
    model: undefined,
    conversationId: null,
    tool: undefined,
    isStreaming: false,
    lastMeta: null,
    lastUsage: null,
    error: null,

    setModel: (model) => set({ model }),
    setTool: (tool) => set({ tool }),

    clear: () => {
      controller?.abort();
      controller = null;
      set({
        messages: [],
        conversationId: null,
        isStreaming: false,
        lastMeta: null,
        lastUsage: null,
        error: null,
      });
    },

    openConversation: ({ id, messages, tool }) => {
      controller?.abort();
      controller = null;
      set({
        messages,
        conversationId: id,
        ...(tool !== undefined ? { tool } : {}),
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

    send: async (text, imageUrls) => {
      const trimmed = text.trim();
      const images = (imageUrls ?? []).filter(Boolean);
      if ((!trimmed && images.length === 0) || get().isStreaming) return;

      const userMsg: ChatMessage = {
        id: newId(),
        role: 'user',
        content: trimmed || '',
        ...(images.length > 0 ? { images: [...images] } : {}),
      };
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
        const { model: activeModel, conversationId: activeConversation, tool: activeTool } = get();
        const payload = {
          messages: history.map((m) => ({ role: m.role, content: toContent(m) })),
          ...(activeModel ? { model: activeModel } : {}),
          ...(activeConversation ? { conversationId: activeConversation } : {}),
          ...(activeTool ? { tool: activeTool } : {}),
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
          } else if (ev.event === 'done') {
            const conversationId = ev.data.conversationId ?? null;
            if (conversationId) set({ conversationId });
            if (ev.data.requestId) {
              patchAssistant((m) => ({ ...m, requestId: ev.data.requestId }));
            }
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
