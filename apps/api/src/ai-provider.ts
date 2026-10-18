/**
 * AI provider adapter factory (server-held credentials — SECURITY.md §9).
 * Cached per isolate like the better-auth instance; rebuilt on config change.
 */

import { createOllamaAdapter, type ProviderAdapter } from '@conai/ai';
import type { Env } from './env';

const DEFAULT_OLLAMA_BASE_URL = 'https://ollama.com/api';

let cached: { key: string; adapter: ProviderAdapter } | null = null;

export function aiConfigured(env: Env): boolean {
  return Boolean(env.OLLAMA_API_KEY);
}

export function getProviderAdapter(env: Env): ProviderAdapter {
  if (!env.OLLAMA_API_KEY) {
    throw new Error('OLLAMA_API_KEY is not configured');
  }
  const baseUrl = env.OLLAMA_BASE_URL ?? DEFAULT_OLLAMA_BASE_URL;
  const key = `${baseUrl}|${env.OLLAMA_API_KEY}`;
  if (cached && cached.key === key) return cached.adapter;
  const adapter = createOllamaAdapter({ baseUrl, apiKey: env.OLLAMA_API_KEY });
  cached = { key, adapter };
  return adapter;
}
