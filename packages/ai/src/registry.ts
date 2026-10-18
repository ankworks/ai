import type { AIModelDescriptor } from './index';
import { GatewayError } from './errors';

/**
 * Default model registry for ConAI Auto (spec §6 — model registry).
 *
 * Model IDs target Ollama (Cloud) naming; **verify availability against the
 * deployed provider at rollout** — admins can override the whole registry via
 * the platform setting `ai.registry` (JSON array) without a code deploy.
 */
export const DEFAULT_MODELS: AIModelDescriptor[] = [
  {
    id: 'llama3.3:70b',
    provider: 'ollama_cloud',
    displayName: 'Llama 3.3 70B',
    description: 'Balanced default for everyday chat and writing.',
    capabilities: ['streaming'],
    pricingMultiplier: 1,
    enabled: true,
    fallbacks: ['gemma3:27b'],
    autoRank: 10,
  },
  {
    id: 'gemma3:27b',
    provider: 'ollama_cloud',
    displayName: 'Gemma 3 27B',
    description: 'Vision-capable model for images and screenshots.',
    capabilities: ['streaming', 'vision'],
    pricingMultiplier: 1.25,
    enabled: true,
    fallbacks: ['llama3.3:70b'],
    autoRank: 12,
  },
  {
    id: 'qwen2.5-coder:32b',
    provider: 'ollama_cloud',
    displayName: 'Qwen 2.5 Coder 32B',
    description: 'Code-focused model for programming tasks.',
    capabilities: ['streaming', 'code'],
    pricingMultiplier: 1,
    enabled: true,
    fallbacks: ['llama3.3:70b'],
    autoRank: 15,
  },
  {
    id: 'llama3.1:8b',
    provider: 'ollama_cloud',
    displayName: 'Llama 3.1 8B',
    description: 'Fast, cheapest tier for quick answers.',
    capabilities: ['streaming'],
    pricingMultiplier: 0.5,
    enabled: true,
    fallbacks: ['llama3.3:70b'],
    autoRank: 20,
  },
];

export const AI_REGISTRY_SETTING_KEY = 'ai.registry';

/**
 * Validate a registry (admin override or defaults): unique ids, resolvable
 * fallbacks, sane multipliers, ≥1 enabled model.
 */
export function resolveRegistry(models: AIModelDescriptor[] = DEFAULT_MODELS): AIModelDescriptor[] {
  if (!Array.isArray(models) || models.length === 0) {
    throw new GatewayError('model_unavailable', 'Model registry is empty');
  }
  const ids = new Set<string>();
  for (const m of models) {
    if (!m.id || typeof m.id !== 'string')
      throw new GatewayError('invalid_request', 'Model id missing');
    if (ids.has(m.id)) throw new GatewayError('invalid_request', `Duplicate model id: ${m.id}`);
    ids.add(m.id);
    if (!Number.isFinite(m.pricingMultiplier) || m.pricingMultiplier < 0) {
      throw new GatewayError('invalid_request', `Bad pricingMultiplier for ${m.id}`);
    }
  }
  for (const m of models) {
    for (const f of m.fallbacks) {
      if (!ids.has(f))
        throw new GatewayError('invalid_request', `Fallback '${f}' of '${m.id}' not in registry`);
    }
  }
  if (!models.some((m) => m.enabled)) {
    throw new GatewayError('model_unavailable', 'No enabled models in registry');
  }
  return models;
}

export function findModel(models: AIModelDescriptor[], id: string): AIModelDescriptor | undefined {
  return models.find((m) => m.id === id);
}
