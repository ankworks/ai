import type { AIModelDescriptor, ChatMessage, RoutingDecision } from './index';
import { GatewayError } from './errors';

/**
 * ConAI Auto routing (spec §6): deterministic, testable heuristics —
 *  1. manual model requests are honored (or fail closed);
 *  2. vision requests only route to vision-capable models;
 *  3. code-heavy requests prefer code models;
 *  4. everything else follows the registry autoRank (cost-efficiency order);
 *  5. models flagged unhealthy are skipped; fallback chains are pruned to
 *     models that actually exist and are enabled.
 */

export interface RouteInput {
  requestedModel?: string | undefined;
  messages: ChatMessage[];
  registry: AIModelDescriptor[];
  /** Model ids currently in provider cool-down (KV circuit breaker). */
  unhealthyModels?: ReadonlySet<string>;
}

function messageText(content: ChatMessage['content']): string {
  if (typeof content === 'string') return content;
  return content
    .filter((p) => p.type === 'text' && typeof p.text === 'string')
    .map((p) => p.text ?? '')
    .join('\n');
}

export function hasImageInput(messages: ChatMessage[]): boolean {
  return messages.some(
    (m) => Array.isArray(m.content) && m.content.some((p) => p.type === 'image' && !!p.imageUrl),
  );
}

export function isCodeTask(messages: ChatMessage[]): boolean {
  const lastUser = [...messages].reverse().find((m) => m.role === 'user');
  if (!lastUser) return false;
  const text = messageText(lastUser.content);
  if (/```[\s\S]*```/.test(text)) return true;
  return /\b(function|class|const |let |import |def |SELECT |API|bug|error|stack trace|regex)\b/i.test(
    text,
  );
}

function eligible(
  registry: AIModelDescriptor[],
  unhealthy: ReadonlySet<string> | undefined,
): AIModelDescriptor[] {
  return registry.filter((m) => m.enabled && !(unhealthy?.has(m.id) ?? false));
}

function byRank(a: AIModelDescriptor, b: AIModelDescriptor): number {
  return (a.autoRank ?? 999) - (b.autoRank ?? 999);
}

/** Ordered fallback chain: model.fallbacks first, then global rank order. */
export function fallbackChainFor(
  model: AIModelDescriptor,
  registry: AIModelDescriptor[],
  unhealthy?: ReadonlySet<string>,
): string[] {
  const chain: string[] = [];
  const push = (id: string) => {
    if (id !== model.id && !chain.includes(id) && chain.length < 3) {
      const target = registry.find((m) => m.id === id);
      if (target?.enabled && !(unhealthy?.has(id) ?? false)) chain.push(id);
    }
  };
  for (const f of model.fallbacks) push(f);
  for (const m of [...eligible(registry, unhealthy)].sort(byRank)) push(m.id);
  return chain;
}

export function routeRequest(input: RouteInput): RoutingDecision {
  const { registry, messages, unhealthyModels } = input;
  const candidates = eligible(registry, unhealthyModels);

  if (input.requestedModel) {
    const model = candidates.find((m) => m.id === input.requestedModel);
    if (!model) {
      const known = registry.find((m) => m.id === input.requestedModel);
      throw new GatewayError(
        'model_unavailable',
        known && !known.enabled
          ? `Model '${input.requestedModel}' is disabled`
          : `Model '${input.requestedModel}' is unknown or unavailable`,
      );
    }
    return {
      mode: 'manual',
      modelId: model.id,
      provider: model.provider,
      reason: 'manual',
      fallbackChain: fallbackChainFor(model, registry, unhealthyModels),
      pricingMultiplier: model.pricingMultiplier,
    };
  }

  if (candidates.length === 0) {
    throw new GatewayError(
      'model_unavailable',
      'No models available right now — try again shortly',
      {
        retryable: true,
      },
    );
  }

  const vision = hasImageInput(messages);
  const code = isCodeTask(messages);

  let pool = candidates;
  let reason: RoutingDecision['reason'] = 'cost';
  if (vision) {
    const visionPool = pool.filter((m) => m.capabilities.includes('vision'));
    if (visionPool.length > 0) {
      pool = visionPool;
      reason = 'capability';
    }
  } else if (code) {
    const codePool = pool.filter((m) => m.capabilities.includes('code'));
    if (codePool.length > 0) {
      pool = codePool;
      reason = 'capability';
    }
  }

  const chosen = [...pool].sort(byRank)[0]!;
  return {
    mode: 'auto',
    modelId: chosen.id,
    provider: chosen.provider,
    reason,
    fallbackChain: fallbackChainFor(chosen, registry, unhealthyModels),
    pricingMultiplier: chosen.pricingMultiplier,
  };
}
