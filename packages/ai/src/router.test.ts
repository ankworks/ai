import { describe, expect, it } from 'vitest';
import { fallbackChainFor, isCodeTask, hasImageInput, routeRequest } from './router';
import { GatewayError } from './errors';
import type { AIModelDescriptor, ChatMessage } from './index';

const registry: AIModelDescriptor[] = [
  {
    id: 'fast',
    provider: 'ollama_cloud',
    displayName: 'Fast',
    capabilities: ['chat', 'streaming'],
    pricingMultiplier: 0.5,
    enabled: true,
    fallbacks: [],
    autoRank: 10,
  },
  {
    id: 'smart',
    provider: 'ollama_cloud',
    displayName: 'Smart',
    capabilities: ['chat', 'streaming'],
    pricingMultiplier: 1,
    enabled: true,
    fallbacks: ['fast'],
    autoRank: 20,
  },
  {
    id: 'vision',
    provider: 'ollama_cloud',
    displayName: 'Vision',
    capabilities: ['chat', 'vision'],
    pricingMultiplier: 1.25,
    enabled: true,
    fallbacks: ['smart'],
    autoRank: 30,
  },
  {
    id: 'coder',
    provider: 'ollama_cloud',
    displayName: 'Coder',
    capabilities: ['chat', 'code'],
    pricingMultiplier: 1,
    enabled: true,
    fallbacks: ['smart'],
    autoRank: 40,
  },
  {
    id: 'off',
    provider: 'ollama_cloud',
    displayName: 'Off',
    capabilities: ['chat'],
    pricingMultiplier: 1,
    enabled: false,
    fallbacks: [],
    autoRank: 1,
  },
];

const user = (text: string): ChatMessage => ({ role: 'user', content: text });
const visionMsg: ChatMessage = {
  role: 'user',
  content: [
    { type: 'text', text: 'what is this?' },
    { type: 'image', imageUrl: 'data:image/png;base64,AAAA' },
  ],
};

describe('routeRequest', () => {
  it('honours a manual selection and attaches its fallback chain', () => {
    const decision = routeRequest({ requestedModel: 'smart', messages: [user('hi')], registry });
    expect(decision.mode).toBe('manual');
    expect(decision.modelId).toBe('smart');
    // declared fallback first, then rank fill — capped at 3, never self
    expect(decision.fallbackChain[0]).toBe('fast');
    expect(decision.fallbackChain.length).toBeLessThanOrEqual(3);
    expect(decision.fallbackChain).not.toContain('smart');
    expect(decision.pricingMultiplier).toBe(1);
  });

  it('fails closed for unknown or disabled manual models', () => {
    expect(() =>
      routeRequest({ requestedModel: 'ghost', messages: [user('x')], registry }),
    ).toThrow(GatewayError);
    expect(() => routeRequest({ requestedModel: 'off', messages: [user('x')], registry })).toThrow(
      /disabled/,
    );
  });

  it('routes plain chat to the cheapest rank (auto mode)', () => {
    const decision = routeRequest({ messages: [user('tell me a joke')], registry });
    expect(decision.mode).toBe('auto');
    expect(decision.modelId).toBe('fast');
    expect(decision.reason).toBe('cost');
  });

  it('routes image input to a vision-capable model', () => {
    expect(hasImageInput([visionMsg])).toBe(true);
    const decision = routeRequest({ messages: [visionMsg], registry });
    expect(decision.modelId).toBe('vision');
    expect(decision.reason).toBe('capability');
    expect(decision.pricingMultiplier).toBe(1.25);
  });

  it('routes code-heavy prompts to the code model', () => {
    const codeMsg = [user('```ts\nconst x = 1\n```\nfix the bug')];
    expect(isCodeTask(codeMsg)).toBe(true);
    const decision = routeRequest({ messages: codeMsg, registry });
    expect(decision.modelId).toBe('coder');
    expect(decision.reason).toBe('capability');
  });

  it('skips unhealthy models when picking and when building chains', () => {
    const decision = routeRequest({
      messages: [user('hello')],
      registry,
      unhealthyModels: new Set(['fast']),
    });
    expect(decision.modelId).toBe('smart');
    expect(decision.fallbackChain).not.toContain('fast');
  });

  it('throws retryable when nothing is available', () => {
    try {
      routeRequest({ messages: [user('x')], registry: [registry[4]!] });
      expect.unreachable('should have thrown');
    } catch (error) {
      expect(error).toBeInstanceOf(GatewayError);
      expect((error as GatewayError).retryable).toBe(true);
    }
  });
});

describe('fallbackChainFor', () => {
  it('prefers declared fallbacks, then rank order, capped at 3', () => {
    const smart = registry[1]!;
    expect(fallbackChainFor(smart, registry)).toEqual(['fast', 'vision', 'coder']);
  });

  it('never includes the model itself or disabled entries', () => {
    const fast = registry[0]!;
    const chain = fallbackChainFor(fast, registry);
    expect(chain).not.toContain('fast');
    expect(chain).not.toContain('off');
  });
});
