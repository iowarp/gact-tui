import { QueryClient } from '@tanstack/react-query';
import { describe, expect, it, vi } from 'vitest';
import { CLIO_WORKSPACE_CATALOG_ROW } from '@/test-fixtures/a2ui/v0_9_1/fixtures';
import { firstMessageMetadata } from './first-message-metadata';

function repository() {
  return {
    a2uiCatalogs: vi.fn().mockResolvedValue({ rows: [CLIO_WORKSPACE_CATALOG_ROW], rejected: [] }),
    a2uiCapabilities: vi.fn().mockResolvedValue({
      agent: { 'v0.9': { supportedCatalogIds: [CLIO_WORKSPACE_CATALOG_ROW.catalogId] } },
    }),
  };
}

describe('first draft message A2UI negotiation', () => {
  it('resolves real renderer components and warms the session query cache before sending', async () => {
    const api = repository();
    const client = new QueryClient();
    const result = await firstMessageMetadata(api, client, 'new_session');
    expect(result.a2uiClientCapabilities['v0.9'].supportedCatalogIds).toEqual([
      CLIO_WORKSPACE_CATALOG_ROW.catalogId,
    ]);
    expect(client.getQueryData(['a2ui-catalogs', 'new_session'])).toEqual({
      rows: [CLIO_WORKSPACE_CATALOG_ROW],
      rejected: [],
    });
    await firstMessageMetadata(api, client, 'new_session');
    expect(api.a2uiCatalogs).toHaveBeenCalledTimes(1);
    expect(api.a2uiCapabilities).toHaveBeenCalledTimes(1);
  });

  it.each(['a2uiCatalogs', 'a2uiCapabilities'] as const)(
    'does not claim support when %s fails',
    async (method) => {
      const api = repository();
      api[method].mockRejectedValue(new Error('Malformed response'));
      const result = await firstMessageMetadata(api, new QueryClient(), 'new_session');
      expect(result.a2uiClientCapabilities['v0.9'].supportedCatalogIds).toEqual([]);
    },
  );

  it('does not advertise agent preferences absent from the resolved catalog rows', async () => {
    const api = repository();
    api.a2uiCatalogs.mockResolvedValue({ rows: [], rejected: [] });
    const result = await firstMessageMetadata(api, new QueryClient(), 'new_session');
    expect(result.a2uiClientCapabilities['v0.9'].supportedCatalogIds).toEqual([]);
  });
});
