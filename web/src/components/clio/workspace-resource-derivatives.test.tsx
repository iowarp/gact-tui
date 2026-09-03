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
vi.mock('./document-pdf-viewer', () => ({
  ClioDocumentPdfViewer: ({ name }: { name: string }) => <div>Rendered PDF {name}</div>,
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
  options: { pending?: boolean; processing?: WorkspaceResourceProcessing | undefined } = {},
) {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  render(
    <QueryClientProvider client={client}>
      <WorkspaceResourceDerivativesView
        derivatives={derivatives}
        pending={options.pending}
        processing={
          'processing' in options ? options.processing : { ...processing, state: processingState }
        }
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
    isStale: (key: readonly unknown[]) => client.getQueryState([...key])?.isInvalidated === true,
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

  it('claims nothing about derivatives while the service is still being asked', () => {
    renderView([], undefined, { pending: true, processing: undefined });

    expect(screen.getByLabelText('Loading derivatives')).toBeVisible();
    expect(screen.queryByText('No derivatives')).not.toBeInTheDocument();
    expect(
      screen.queryByText('No derived representations have been recorded for this resource.'),
    ).not.toBeInTheDocument();
    expect(screen.queryByText(/not started/iu)).not.toBeInTheDocument();
  });

  it('states an absence once the service has actually answered', async () => {
    renderView([], undefined, { processing: undefined });

    expect(await screen.findByText('No derivatives')).toBeVisible();
    expect(screen.queryByLabelText('Loading derivatives')).not.toBeInTheDocument();
  });

  it('shows real converter activity without presenting stage markers as percentages', () => {
    renderView([], 'processing', {
      processing: {
        ...processing,
        state: 'processing',
        progress: 40,
        progress_kind: 'stage',
        stage: 'docling',
        message: 'Docling is still processing',
        events: [
          {
            sequence: 12,
            created_at: '2026-09-02T19:49:12Z',
            level: 'info',
            progress: 40,
            progress_kind: 'stage',
            stage: 'docling',
            message: 'Reading page layout',
          },
          {
            sequence: 13,
            created_at: '2026-09-02T19:49:13Z',
            level: 'warning',
            progress: 40,
            progress_kind: 'stage',
            stage: 'docling',
            message: 'Fallback font used',
          },
        ],
      },
    });

    expect(screen.getByRole('region', { name: 'Conversion activity' })).toBeVisible();
    expect(screen.getByText('Reading page layout')).toBeVisible();
    expect(screen.getByText('Fallback font used')).toBeVisible();
    expect(screen.getByLabelText('Warning')).toBeVisible();
    expect(screen.queryByText('40%')).not.toBeInTheDocument();
    expect(screen.queryByText('No derivatives')).not.toBeInTheDocument();
  });

  it('does not describe a terminal conversion as still waiting when no events were retained', () => {
    renderView([], 'failed', {
      processing: {
        ...processing,
        state: 'failed',
        message: undefined,
        events: [],
      },
    });

    expect(screen.getByText('No conversion activity was reported.')).toBeVisible();
    expect(screen.queryByText('Waiting for converter activity.')).not.toBeInTheDocument();
  });

  it('replaces conversion activity with derivative files once output exists', () => {
    renderView([derivative], 'complete', {
      processing: {
        ...processing,
        events: [
          {
            sequence: 14,
            created_at: '2026-09-02T19:49:14Z',
            level: 'info',
            progress: 100,
            progress_kind: 'stage',
            stage: 'complete',
            message: 'Conversion complete',
          },
        ],
      },
    });

    expect(screen.getByRole('button', { name: /report\.md/i })).toBeVisible();
    expect(screen.queryByRole('region', { name: 'Conversion activity' })).not.toBeInTheDocument();
  });

  it('previews a PDF derivative with the shared viewer, not the native plugin', async () => {
    repository.resourceDerivativeContent.mockResolvedValue(new Uint8Array([37, 80, 68, 70]));
    const user = userEvent.setup();
    renderView([
      {
        id: 'derivative_pdf',
        name: 'report.pdf',
        media_type: 'application/pdf',
        kind: 'pdf',
        size: 4,
      },
    ]);

    await user.click(screen.getByRole('button', { name: /report\.pdf/i }));

    expect(await screen.findByText('Rendered PDF report.pdf')).toBeVisible();
    // The native plugin renders a blank pane on WebKitGTK with no fallback.
    expect(document.querySelector('object[type="application/pdf"]')).not.toBeInTheDocument();
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
