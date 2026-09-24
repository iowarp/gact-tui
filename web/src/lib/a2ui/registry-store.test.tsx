import { mergeA2uiClientMetadata } from '@clio/core/v3';
import type { A2UISurface } from '@clio/core/v3';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { act, cleanup, render, screen, waitFor } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import {
  CLIO_A2UI_CATALOG_ID,
  CLIO_WORKSPACE_CATALOG_ROW,
} from '@/test-fixtures/a2ui/v0_9_1/fixtures';
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
      expect(
        mergeA2uiClientMetadata('sess_shared', undefined)?.a2uiClientCapabilities,
      ).toBeDefined(),
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
    expect(mergeA2uiClientMetadata('sess_shared', undefined)?.a2uiClientCapabilities).toMatchObject(
      {
        'v0.9': { supportedCatalogIds: [CLIO_WORKSPACE_CATALOG_ROW.catalogId] },
      },
    );
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

describe('graceful degradation when the registry routes 404 (S1 item 3, supersedes S6 item 2a)', () => {
  it('fetches each route exactly once, advertises NO catalogs, and records the reason', async () => {
    // S1 item 3 (no-silent-fallback): a broken registry route used to still
    // advertise the client's own well-known fallback ids
    // (`[clio-workspace, basic]`), which happened to intersect a session's
    // producible set, so the server's `select_catalog` picked a catalog this
    // client could not actually render and `create_a2ui_surface` returned
    // `created: true` for it -- the root cause of "Interactive surface
    // unavailable" reported alongside a successful-looking tool result.
    // Advertising an EMPTY list instead makes the server refuse with a typed
    // `a2ui_catalog_no_client_match` reason, never a false `created: true`.
    const notFound = () => Promise.reject(new Error('404'));
    repository.a2uiCatalogs.mockImplementation(notFound);
    repository.a2uiCapabilities.mockImplementation(notFound);
    const consoleError = vi.spyOn(console, 'error').mockImplementation(() => undefined);

    const client = new QueryClient({ defaultOptions: { mutations: { retry: false } } });
    render(
      <QueryClientProvider client={client}>
        <A2uiSessionRegistryOwner sessionId="sess_old_server">
          <div>no A2UI support here</div>
        </A2uiSessionRegistryOwner>
      </QueryClientProvider>,
    );

    await waitFor(() => {
      const metadata = mergeA2uiClientMetadata('sess_old_server', undefined);
      expect(metadata?.a2uiClientCapabilities).toMatchObject({
        'v0.9': { supportedCatalogIds: [] },
      });
    });

    // Give any retry timer a chance to fire before asserting the count --
    // wrapped in act() (not a bare setTimeout) so a query observer settling
    // one microtask later than the render this waited for is still flushed
    // inside an act() boundary, rather than warning as an unwrapped update.
    await act(() => new Promise((resolve) => setTimeout(resolve, 50)));
    expect(repository.a2uiCatalogs).toHaveBeenCalledTimes(1);
    expect(repository.a2uiCapabilities).toHaveBeenCalledTimes(1);
    expect(consoleError).not.toHaveBeenCalled();
  });
});

describe('the registry owner fetches every session a mounted surface references (S1 item A2)', () => {
  it('resolves a surface whose session_id is a referenced session, not just the primary one', async () => {
    // Before this fix, `useA2uiSessionRegistry` only ever fetched the single
    // "open" session id it was called with. A surface belonging to a
    // DIFFERENT session (a subagent canvas, or a pending interaction owned
    // by a child session) read a lazily-created, never-populated registry
    // entry (`registry-store.ts`'s `entryFor` defaults `isLoading: true`)
    // that nothing ever resolved, so it stayed on "Resolving the interactive
    // catalog…" forever. Mounting the owner with BOTH the primary and the
    // referenced session id (mirroring `use-workspace-data.ts`'s
    // `a2uiReferencedSessionIds`) must resolve a surface keyed by either one.
    const client = new QueryClient({ defaultOptions: { mutations: { retry: false } } });
    render(
      <QueryClientProvider client={client}>
        <A2uiSessionRegistryOwner sessionId={['sess_primary', 'sess_child']}>
          <ClioA2UISurface surface={textSurface('surface_child', 'sess_child', 'Child Surface')} />
        </A2uiSessionRegistryOwner>
      </QueryClientProvider>,
    );

    expect(await screen.findByText('Child Surface')).toBeVisible();
    expect(screen.queryByText(/Resolving the interactive catalog/i)).not.toBeInTheDocument();
    await waitFor(() => {
      const metadata = mergeA2uiClientMetadata('sess_child', undefined);
      expect(metadata?.a2uiClientCapabilities).toMatchObject({
        'v0.9': { supportedCatalogIds: [CLIO_WORKSPACE_CATALOG_ROW.catalogId] },
      });
    });
  });
});
