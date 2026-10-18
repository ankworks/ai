/**
 * AI Gateway contracts (Phase 1 types; adapters + routing implemented in Phase 3).
 *
 * Invariants:
 *  - Provider API keys NEVER appear in these types' payloads sent to browsers.
 *  - Every gateway call is wrapped in Sparks reserve → settle (see @conai/sparks).
 *  - Streaming chunks are provider-agnostic; adapters normalize provider events.
 */

export type ProviderId = 'ollama_cloud' | (string & {});

export type ModelCapability = 'streaming' | 'vision' | 'tools' | 'search' | 'reasoning' | 'code';

export interface AIModelDescriptor {
  /** Stable model id used by clients, e.g. 'llama3.3:70b'. */
  id: string;
  provider: ProviderId;
  displayName: string;
  description?: string;
  capabilities: ModelCapability[];
  /** Admin-configured Sparks multiplier (1 = base pricing). */
  pricingMultiplier: number;
  enabled: boolean;
  /** Ordered fallback model ids tried on retryable failures (admin-configured). */
  fallbacks: string[];
  /** Sorted preference for ConAI Auto (lower = preferred when capable). */
  autoRank?: number;
}

export interface ChatMessagePart {
  type: 'text' | 'image';
  text?: string;
  /** Data URL or API-delivered file reference — never a raw B2 key. */
  imageUrl?: string;
}

export interface ChatMessage {
  role: 'system' | 'user' | 'assistant';
  content: string | ChatMessagePart[];
}

export interface GatewayRequest {
  requestId: string; // idempotency key
  userId: string;
  model?: string; // omit → ConAI Auto
  messages: ChatMessage[];
  /** Temperature etc. — validated, bounded. */
  options?: { temperature?: number; maxTokens?: number };
  /** Conversation scoping for history persistence. */
  conversationId?: string;
}

export type StreamChunk =
  | { type: 'text'; text: string }
  | { type: 'tool_call'; name: string; args: unknown }
  | { type: 'usage'; inputTokens: number; outputTokens: number; visionTokens?: number }
  | { type: 'done'; finishReason: 'stop' | 'length' | 'cancelled' | 'error' }
  | { type: 'error'; code: GatewayErrorCode; message: string; retryable: boolean };

export type GatewayErrorCode =
  | 'provider_auth'
  | 'provider_rate_limit'
  | 'model_unavailable'
  | 'network'
  | 'policy_blocked'
  | 'budget_exceeded'
  | 'insufficient_sparks'
  | 'not_configured'
  | 'invalid_request';

export interface ProviderAdapter {
  readonly id: ProviderId;
  /** Normalized SSE-style stream; must honor AbortSignal (stop generation). */
  stream(request: GatewayRequest, signal: AbortSignal): AsyncIterable<StreamChunk>;
  /** Capability/model discovery for the registry (admin refresh). */
  listModels(): Promise<AIModelDescriptor[]>;
  /** Lightweight liveness probe used by the status page. */
  health(): Promise<{ ok: boolean; detail?: string }>;
}

export type RoutingMode = 'auto' | 'manual';

export interface RoutingDecision {
  mode: RoutingMode;
  modelId: string;
  provider: ProviderId;
  /** Why Auto picked this (manual requests keep 'manual'). */
  reason: 'capability' | 'cost' | 'policy' | 'manual' | 'fallback';
  fallbackChain: string[];
  pricingMultiplier: number;
}

/** Registry refresh is admin-triggered; results are cached in KV with a short TTL. */
export interface ModelRegistrySnapshot {
  models: AIModelDescriptor[];
  fetchedAt: string;
}

// ── Phase 3 implementations (registry, routing, estimation, adapters) ────────
export * from './errors';
export * from './registry';
export * from './router';
export * from './estimate';
export * from './ndjson';
export * from './providers/ollama';
