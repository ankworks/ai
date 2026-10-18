import { describe, expect, it } from 'vitest';
import { DEFAULT_MODELS, resolveRegistry } from './registry';
import { GatewayError } from './errors';
import type { AIModelDescriptor } from './index';

const m = (over: Partial<AIModelDescriptor> & { id: string }): AIModelDescriptor => ({
  provider: 'ollama_cloud',
  displayName: over.id,
  capabilities: ['streaming'],
  pricingMultiplier: 1,
  enabled: true,
  fallbacks: [],
  autoRank: 10,
  ...over,
});

describe('resolveRegistry', () => {
  it('validates the default catalog', () => {
    const registry = resolveRegistry(DEFAULT_MODELS);
    expect(registry.length).toBeGreaterThanOrEqual(4);
    expect(registry.map((x) => x.id)).toContain('llama3.3:70b');
    expect(registry.every((x) => x.capabilities.length > 0)).toBe(true);
    expect(registry.every((x) => x.pricingMultiplier > 0)).toBe(true);
  });

  it('keeps admin override order after validation', () => {
    const override = [
      m({ id: 'custom-1', autoRank: 1 }),
      m({ id: 'custom-2', autoRank: 2, fallbacks: ['custom-1'] }),
    ];
    const registry = resolveRegistry(override);
    expect(registry.map((x) => x.id)).toEqual(['custom-1', 'custom-2']);
  });

  it('rejects an empty registry', () => {
    expect(() => resolveRegistry([])).toThrow(GatewayError);
  });

  it('rejects duplicate ids', () => {
    expect(() => resolveRegistry([m({ id: 'a' }), m({ id: 'a' })])).toThrow(/Duplicate model id/);
  });

  it('rejects fallbacks pointing outside the registry', () => {
    expect(() => resolveRegistry([m({ id: 'a', fallbacks: ['ghost'] })])).toThrow(
      /not in registry/,
    );
  });

  it('rejects a registry where every model is disabled', () => {
    expect(() => resolveRegistry([m({ id: 'a', enabled: false })])).toThrow(/No enabled models/);
  });

  it('rejects non-finite or negative pricing multipliers (0 = free is allowed)', () => {
    expect(() => resolveRegistry([m({ id: 'a', pricingMultiplier: -1 })])).toThrow(
      /pricingMultiplier/,
    );
    expect(() => resolveRegistry([m({ id: 'a', pricingMultiplier: Number.NaN })])).toThrow(
      /pricingMultiplier/,
    );
    expect(resolveRegistry([m({ id: 'a', pricingMultiplier: 0 })])).toHaveLength(1);
  });
});
