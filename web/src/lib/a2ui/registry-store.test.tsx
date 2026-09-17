import { mergeA2uiClientMetadata } from '@clio/core/v3';
import type { A2UISurface } from '@clio/core/v3';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { cleanup, render, screen, waitFor } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { CLIO_A2UI_CATALOG_ID, CLIO_WORKSPACE_CATALOG_ROW } from '@/test-fixtures/a2ui/v0_9_1/fixtures';
import { A2uiSessionRegistryOwner } from '@/test-fixtures/a2ui/v0_9_1/test-harness';
import { ClioA2UISurface } from '@/components/clio/a2ui-surface';

const repository = vi.hoisted(() => ({
  a2uiAction: vi.fn().mockResolvedValue({ status: 'accepted' }),
  a2uiCatalogs: vi.fn(),
  a2uiCapabilities: vi.fn(),
}));

vi.mock('@/hooks/use-repository', () => ({ useRepository: () => repository }));

beforeEach(() => {
  repository.a2uiCatalogs.mockResolvedValue([CLIO_WORKSPACE_CATALOG_ROW]);
  repository.a2uiCapabilities.mockResolvedValue({
    agent: { 'v0.9': { supportedCatalogIds: [CLIO_WORKSPACE_CATALOG_ROW.catalogId] } },
    client: null,
    selection: null,
  });
});

afterEach(() => {
  cleanup();
  repository.a2uiAction.mockClear();
  repository.a2uiCatalogs.mockClear();
  repository.a2uiCapabilities.mockClear();
});

function textSurface(id: string, sessionId: string, text: string): A2UISurface {
  return {
    id,
    session_id: sessionId,
    catalog_id: CLIO_A2UI_CATALOG_ID,
    protocol_version: '0.9.1',
    revision: 1,
    state: 'ready',
    messages: [
      { version: 'v0.9.1', createSurface: { surfaceId: id, catalogId: CLIO_A2UI_CATALOG_ID } },
      {
        version: 'v0.9.1',
        updateComponents: {
          surfaceId: id,
          components: [{ id: 'root', component: 'Text', text }],
        },
      },
    ],
  };
}

describe('session-lifetime A2UI registry (S6 adversarial review, BLOCKING)', () => {
  it('advertises a2uiClientCapabilities as soon as the session opens, before any surface mounts', async () => {
    const client = new QueryClient({ defaultOptions: { mutations: { retry: false } } });
    render(
      <QueryClientProvider client={client}>
        <A2uiSessionRegistryOwner sessionId="sess_fresh">
          <div>no surface yet</div>
        </A2uiSessionRegistryOwner>
      </QueryClientProvider>,
    );

    await waitFor(() => {
      const metadata = mergeA2uiClientMetadata('sess_fresh', undefined);
      expect(metadata?.a2uiClientCapabilities).toMatchObject({
        'v0.9': { supportedCatalogIds: [CLIO_WORKSPACE_CATALOG_ROW.catalogId] },
      });
    });
  });

  it('leaves the advertisement intact, and another surface untouched, when one surface unmounts', async () => {
    const client = new QueryClient({ defaultOptions: { mutations: { retry: false } } });
    function Scene({ showFirst }: { showFirst: boolean }) {
      return (
        <A2uiSessionRegistryOwner sessionId="sess_shared">
          {showFirst ? (
            <ClioA2UISurface surface={textSurface('surface_a', 'sess_shared', 'Surface A')} />
          ) : null}
          <ClioA2UISurface surface={textSurface('surface_b', 'sess_shared', 'Surface B')} />
        </A2uiSessionRegistryOwner>
      );
    }

    const { rerender } = render(
      <QueryClientProvider client={client}>
        <Scene showFirst />
      </QueryClientProvider>,
    );

    expect(await screen.findByText('Surface A')).toBeVisible();
    expect(await screen.findByText('Surface B')).toBeVisible();
    await waitFor(() =>
      expect(mergeA2uiClientMetadata('sess_shared', undefined)?.a2uiClientCapabilities).toBeDefined(),
    );

    // Surface A scrolls away (unmounts) — Surface B and the session's own
    // advertisement must not be affected.
    rerender(
      <QueryClientProvider client={client}>
        <Scene showFirst={false} />
      </QueryClientProvider>,
    );

    expect(screen.queryByText('Surface A')).not.toBeInTheDocument();
    expect(screen.getByText('Surface B')).toBeVisible();
    expect(mergeA2uiClientMetadata('sess_shared', undefined)?.a2uiClientCapabilities).toMatchObject({
      'v0.9': { supportedCatalogIds: [CLIO_WORKSPACE_CATALOG_ROW.catalogId] },
    });
  });
});

describe('a2uiClientDataModel aggregation (S6 item 3)', () => {
  function dataModelSurface(id: string, sessionId: string, sendDataModel: boolean): A2UISurface {
    return {
      id,
      session_id: sessionId,
      catalog_id: CLIO_A2UI_CATALOG_ID,
      protocol_version: '0.9.1',
      revision: 1,
      state: 'ready',
      messages: [
        {
          version: 'v0.9.1',
          createSurface: { surfaceId: id, catalogId: CLIO_A2UI_CATALOG_ID, sendDataModel },
        },
        {
          version: 'v0.9.1',
          updateComponents: {
            surfaceId: id,
            components: [{ id: 'root', component: 'TextField', label: 'Name', value: 'Alice' }],
          },
        },
      ],
    };
  }

  it('is present when a live surface was created with sendDataModel: true', async () => {
    const client = new QueryClient({ defaultOptions: { mutations: { retry: false } } });
    render(
      <QueryClientProvider client={client}>
        <A2uiSessionRegistryOwner sessionId="sess_dm_present">
          <ClioA2UISurface surface={dataModelSurface('surface_dm', 'sess_dm_present', true)} />
        </A2uiSessionRegistryOwner>
      </QueryClientProvider>,
    );

    await screen.findByLabelText('Name');
    await waitFor(() => {
      const metadata = mergeA2uiClientMetadata('sess_dm_present', undefined, {
        includeDataModel: true,
      });
      expect(metadata?.a2uiClientDataModel).toMatchObject({
        version: 'v0.9',
        surfaces: { surface_dm: expect.anything() },
      });
    });
  });

  it('is absent when no live surface requested sendDataModel', async () => {
    const client = new QueryClient({ defaultOptions: { mutations: { retry: false } } });
    render(
      <QueryClientProvider client={client}>
        <A2uiSessionRegistryOwner sessionId="sess_dm_absent">
          <ClioA2UISurface surface={dataModelSurface('surface_dm2', 'sess_dm_absent', false)} />
        </A2uiSessionRegistryOwner>
      </QueryClientProvider>,
    );

    await screen.findByLabelText('Name');
    await waitFor(() =>
      expect(
        mergeA2uiClientMetadata('sess_dm_absent', undefined)?.a2uiClientCapabilities,
      ).toBeDefined(),
    );
    expect(
      mergeA2uiClientMetadata('sess_dm_absent', undefined, { includeDataModel: true })
        ?.a2uiClientDataModel,
    ).toBeUndefined();
  });
});
