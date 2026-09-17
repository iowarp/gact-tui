import { describe, expect, it } from 'vitest';
import { a2uiCapabilitiesResponseSchema, orderSupportedCatalogIds } from './capabilities.js';

describe('orderSupportedCatalogIds', () => {
  it('orders pack catalogs first, then the builtins, per the server preference order', () => {
    // The registry resolves rows in the server's GET .../a2ui/catalogs order
    // (builtins first, then packs) — the OPPOSITE of what the agent
    // capabilities route says to advertise.
    const resolved = [
      'https://a2ui.org/specification/v0_9/catalogs/basic/catalog.json',
      'https://iowarp.ai/a2ui/catalogs/clio-workspace/v1',
      'https://packs.example/earthscope/v1',
    ];
    const agentPreference = [
      'https://packs.example/earthscope/v1',
      'https://iowarp.ai/a2ui/catalogs/clio-workspace/v1',
      'https://a2ui.org/specification/v0_9/catalogs/basic/catalog.json',
    ];

    expect(orderSupportedCatalogIds(resolved, agentPreference)).toEqual(agentPreference);
  });

  it('appends an id the agent did not mention, without dropping it', () => {
    expect(orderSupportedCatalogIds(['unlisted', 'basic'], ['basic'])).toEqual(['basic', 'unlisted']);
  });

  it('is a no-op when the preference order is empty', () => {
    expect(orderSupportedCatalogIds(['a', 'b'], [])).toEqual(['a', 'b']);
  });
});

describe('a2uiCapabilitiesResponseSchema', () => {
  it('parses the documented shape', () => {
    const parsed = a2uiCapabilitiesResponseSchema.parse({
      agent: { 'v0.9': { supportedCatalogIds: ['basic'], acceptsInlineCatalogs: false } },
      client: null,
      selection: { catalog_id: 'basic', reason: null },
    });
    expect(parsed.agent['v0.9'].supportedCatalogIds).toEqual(['basic']);
  });
});
