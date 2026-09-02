import type { WorkspaceResourceDerivative, WorkspaceResourceProcessing } from '@clio/core/v3';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { cleanup, render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { queryKeys } from '@/lib/query-keys';
import { WorkspaceResourceDerivativesView } from './workspace-resource-derivatives';

const repository = {
  cancelResourceProcessing: vi.fn(),
  reprocessResource: vi.fn(),
  resourceDerivativeContent: vi.fn(),
};

vi.mock('@/hooks/use-repository', () => ({ useRepository: () => repository }));
vi.mock('@/providers/connection-provider', () => ({
  useConnectionSettings: () => ({ settings: { endpoint: ENDPOINT } }),
}));

const ENDPOINT = 'http://127.0.0.1:8790';
const OTHER_ENDPOINT = 'http://127.0.0.1:8791';

afterEach(() => {
  cleanup();
  vi.clearAllMocks();
});

const derivative: WorkspaceResourceDerivative = {
  id: 'derivative_markdown',
  name: 'report.md',
  media_type: 'text/markdown',
  kind: 'markdown',
  size: 32,
};

const processing: WorkspaceResourceProcessing = {
  workspace_id: 'workspace_1',
  resource_id: 'resource_1',
  resource_revision: 1,
  source_sha256: 'abc',
  processor: 'docling',
  processor_url: 'http://127.0.0.1:8001',
  job_id: 'job_1',
  state: 'complete',
  progress: 100,
  failure: {},
  cancellation: {},
  created_at: '2026-08-31T12:00:00Z',
  updated_at: '2026-08-31T12:00:01Z',
};

function renderView(
  derivatives: WorkspaceResourceDerivative[] = [derivative],
  processingState: WorkspaceResourceProcessing['state'] = processing.state,
) {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  render(
    <QueryClientProvider client={client}>
      <WorkspaceResourceDerivativesView
        derivatives={derivatives}
        processing={{ ...processing, state: processingState }}
        resourceId="resource_1"
        workspaceId="workspace_1"
      />
    </QueryClientProvider>,
  );
  return client;
}

/**
 * Seed the cache with the keys the reading surfaces actually register, so an
 * invalidation that does not prefix-match one of them shows up as a query that
 * is still fresh after the mutation.
 */
function seedReadQueries(client: QueryClient) {
  const keys = {
    derivatives: queryKeys.workspaceResourceDerivatives(ENDPOINT, 'workspace_1', 'resource_1', 1),
    otherEndpointDerivatives: queryKeys.workspaceResourceDerivatives(
      OTHER_ENDPOINT,
      'workspace_1',
      'resource_1',
      1,
    ),
    resources: queryKeys.workspaceResources(ENDPOINT, 'workspace_1'),
    structure: queryKeys.workspaceResourceStructure(ENDPOINT, 'workspace_1', 'resource_1', 1),
    structureNode: queryKeys.workspaceResourceStructureNode(
      ENDPOINT,
      'workspace_1',
      'resource_1',
      'texts',
      0,
    ),
  } as const;
  for (const key of Object.values(keys)) client.setQueryData(key, { seeded: true });
  return {
    isStale: (key: readonly unknown[]) =>
      client.getQueryState([...key])?.isInvalidated === true,
    keys,
  };
}

describe('WorkspaceResourceDerivativesView invalidation', () => {
  it('refreshes every read a reprocess invalidates, on this endpoint only', async () => {
    repository.reprocessResource.mockResolvedValue({ ...processing, state: 'submitted' });
    const user = userEvent.setup();
    const client = renderView([]);
    const cache = seedReadQueries(client);

    await user.click(screen.getByRole('button', { name: 'Reprocess resource' }));

    await waitFor(() => expect(cache.isStale(cache.keys.derivatives)).toBe(true));
    expect(cache.isStale(cache.keys.structure)).toBe(true);
    // The structured node view is served from the previous run without this.
    expect(cache.isStale(cache.keys.structureNode)).toBe(true);
    expect(cache.isStale(cache.keys.otherEndpointDerivatives)).toBe(false);
  });

  it('refreshes the workspace resource list when a conversion is cancelled', async () => {
    repository.cancelResourceProcessing.mockResolvedValue({ ...processing, state: 'cancelled' });
    const user = userEvent.setup();
    const client = renderView([], 'processing');
    const cache = seedReadQueries(client);

    await user.click(screen.getByRole('button', { name: 'Cancel conversion' }));

    await waitFor(() => expect(cache.isStale(cache.keys.derivatives)).toBe(true));
    expect(cache.isStale(cache.keys.resources)).toBe(true);
  });
});

describe('WorkspaceResourceDerivativesView', () => {
  it('opens a bounded derivative preview in place and returns to the list', async () => {
    repository.resourceDerivativeContent.mockResolvedValue(
      new TextEncoder().encode('# Structured report'),
    );
    const user = userEvent.setup();
    renderView();

    await user.click(screen.getByRole('button', { name: /report\.md/i }));
    expect(await screen.findByText('# Structured report')).toBeVisible();
    await user.click(screen.getByRole('button', { name: 'Back to derivatives' }));
    expect(screen.getByRole('button', { name: /report\.md/i })).toBeVisible();
  });

  it('starts reprocessing from the real resource action', async () => {
    repository.reprocessResource.mockResolvedValue({ ...processing, state: 'submitted' });
    const user = userEvent.setup();
    renderView([]);

    await user.click(screen.getByRole('button', { name: 'Reprocess resource' }));
    expect(repository.reprocessResource).toHaveBeenCalledWith('workspace_1', 'resource_1');
  });

  it('lets the user cancel active conversion without an elapsed-time cutoff', async () => {
    repository.cancelResourceProcessing.mockResolvedValue({
      ...processing,
      state: 'cancelled',
    });
    const user = userEvent.setup();
    renderView([], 'processing');

    await user.click(screen.getByRole('button', { name: 'Cancel conversion' }));

    expect(repository.cancelResourceProcessing).toHaveBeenCalledWith('workspace_1', 'resource_1');
  });
});
