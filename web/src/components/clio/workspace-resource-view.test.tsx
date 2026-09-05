import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { cleanup, render, screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import type { WorkspaceResource } from '@clio/core/v3';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { WorkspaceResourceCarousel, WorkspaceResourceView } from './workspace-resource-view';

const repository = vi.hoisted(() => ({
  deleteResource: vi.fn().mockResolvedValue(undefined),
  resourceDeliveries: vi.fn().mockResolvedValue([]),
  resourceDerivatives: vi.fn().mockResolvedValue({
    derivatives: [],
    processor: {
      workspace_id: 'workspace_1',
      resource_id: 'resource_1',
      resource_revision: 1,
      source_sha256: 'abc',
      processor: 'docling',
      processor_url: 'http://processor.test',
      job_id: 'job_1',
      state: 'complete',
      progress: 100,
      derivatives_available: true,
      failure: {},
      cancellation: {},
      created_at: '2026-08-31T00:00:00Z',
      updated_at: '2026-08-31T00:00:00Z',
    },
    resource_id: 'resource_1',
    revision: 1,
  }),
  resourcePreview: vi.fn().mockResolvedValue(new Uint8Array([37, 80, 68, 70])),
  resourceStructure: vi.fn().mockResolvedValue({
    collections: { texts: 2 },
    resource_id: 'resource_1',
    revision: 1,
  }),
  resourceStructureNode: vi.fn().mockResolvedValue({
    collection: 'texts',
    index: 0,
    node: { text: 'First parsed section' },
    resource_id: 'resource_1',
    revision: 1,
  }),
}));

afterEach(() => {
  cleanup();
  vi.clearAllMocks();
  repository.resourceDeliveries.mockResolvedValue([]);
});

vi.mock('@/hooks/use-repository', () => ({ useRepository: () => repository }));
vi.mock('@/providers/connection-provider', () => ({
  useConnectionSettings: () => ({ settings: { endpoint: 'http://127.0.0.1:8790' } }),
}));
vi.mock('./document-pdf-viewer', () => ({
  ClioDocumentPdfViewer: ({ name }: { name: string }) => <div>Rendered PDF {name}</div>,
}));

const resource: WorkspaceResource = {
  id: 'resource_1',
  workspace_id: 'workspace_1',
  client_upload_id: 'upload_1',
  revision: 1,
  name: 'paper.pdf',
  claimed_mime: 'application/pdf',
  detected_mime: 'application/pdf',
  detection_source: 'signature',
  declared_size: 4,
  received_size: 4,
  sha256: 'abc',
  state: 'ready',
  failure: '',
  created_at: '2026-08-31T00:00:00Z',
  updated_at: '2026-08-31T00:00:00Z',
  completed_at: '2026-08-31T00:00:00Z',
  mime_mismatch: false,
};

describe('WorkspaceResourceView', () => {
  it('moves between related message resources without opening another canvas tab', async () => {
    const user = userEvent.setup();
    const queryClient = new QueryClient({ defaultOptions: { queries: { retry: false } } });
    const secondResource = {
      ...resource,
      id: 'resource_2',
      client_upload_id: 'upload_2',
      name: 'appendix.pdf',
    };
    render(
      <QueryClientProvider client={queryClient}>
        <WorkspaceResourceCarousel
          resource={resource}
          resources={[resource, secondResource]}
          workspaceId="workspace_1"
        />
      </QueryClientProvider>,
    );

    expect(await screen.findByRole('heading', { name: 'paper.pdf' })).toBeVisible();
    expect(screen.getByRole('button', { name: 'Show paper.pdf' })).toBeVisible();
    await user.click(screen.getByRole('button', { name: 'Show appendix.pdf' }));

    expect(await screen.findByRole('heading', { name: 'appendix.pdf' })).toBeVisible();
    expect(screen.queryByRole('heading', { name: 'paper.pdf' })).not.toBeInTheDocument();
  });

  it('uses the shared PDF.js viewer instead of the unreliable native object plugin', async () => {
    const objectUrls = vi.spyOn(URL, 'createObjectURL');
    const queryClient = new QueryClient({
      defaultOptions: { queries: { retry: false } },
    });
    render(
      <QueryClientProvider client={queryClient}>
        <WorkspaceResourceView resource={resource} workspaceId="workspace_1" />
      </QueryClientProvider>,
    );

    expect(await screen.findByText('Rendered PDF paper.pdf')).toBeVisible();
    expect(document.querySelector('object[type="application/pdf"]')).not.toBeInTheDocument();
    // The PDF viewer reads the bytes directly, so blobbing the whole document
    // into a second copy the branch never reads is pure memory.
    expect(objectUrls).not.toHaveBeenCalled();
    objectUrls.mockRestore();
  });

  it('offers removal from the resource header, so a stuck resource is not permanent', async () => {
    const user = userEvent.setup();
    const queryClient = new QueryClient({ defaultOptions: { queries: { retry: false } } });
    render(
      <QueryClientProvider client={queryClient}>
        <WorkspaceResourceView
          resource={{ ...resource, state: 'quarantined', failure: 'Rejected by the scanner.' }}
          workspaceId="workspace_1"
        />
      </QueryClientProvider>,
    );

    await user.click(await screen.findByRole('button', { name: 'Remove paper.pdf' }));
    await user.click(screen.getByRole('button', { name: 'Remove resource' }));

    expect(repository.deleteResource).toHaveBeenCalledWith('workspace_1', 'resource_1');
  });

  it('loads the first structured node instead of leaving a disabled query skeleton', async () => {
    const user = userEvent.setup();
    const queryClient = new QueryClient({
      defaultOptions: { queries: { retry: false } },
    });
    render(
      <QueryClientProvider client={queryClient}>
        <WorkspaceResourceView resource={resource} workspaceId="workspace_1" />
      </QueryClientProvider>,
    );

    await user.click(screen.getByRole('tab', { name: 'Structure' }));

    expect(await screen.findByText('Document structure')).toBeVisible();
    expect(await screen.findByText(/First parsed section/u)).toBeVisible();
    expect(repository.resourceStructureNode).toHaveBeenCalledWith(
      'workspace_1',
      'resource_1',
      'texts',
      0,
      expect.any(AbortSignal),
    );
  });

  it('reads an existing derivative after a failed refresh, and says the refresh failed', async () => {
    repository.resourceDerivatives.mockResolvedValueOnce({
      derivatives: [],
      processor: {
        workspace_id: 'workspace_1',
        resource_id: 'resource_1',
        resource_revision: 1,
        source_sha256: 'abc',
        processor: 'docling',
        processor_url: 'http://processor.test',
        job_id: 'job_2',
        state: 'failed',
        progress: 40,
        derivatives_available: true,
        failure: { message: 'The document processor stopped before finishing.' },
        cancellation: {},
        created_at: '2026-08-31T00:00:00Z',
        updated_at: '2026-08-31T00:05:00Z',
      },
      resource_id: 'resource_1',
      revision: 1,
    });
    const user = userEvent.setup();
    const queryClient = new QueryClient({ defaultOptions: { queries: { retry: false } } });
    render(
      <QueryClientProvider client={queryClient}>
        <WorkspaceResourceView resource={resource} workspaceId="workspace_1" />
      </QueryClientProvider>,
    );

    await user.click(screen.getByRole('tab', { name: 'Structure' }));

    // The derivative that already exists is readable; refusing to render it
    // contradicts the availability text that calls the resource ready.
    expect(await screen.findByText('Document structure')).toBeVisible();
    expect(await screen.findByText(/First parsed section/u)).toBeVisible();
    // And the failed refresh is stated rather than passed off as current.
    expect(screen.getByText('The document processor stopped before finishing.')).toBeVisible();
  });

  it('does not declare a resource undelivered while the delivery record is still loading', async () => {
    repository.resourceDeliveries.mockReturnValueOnce(new Promise(() => undefined));
    const user = userEvent.setup();
    const queryClient = new QueryClient({ defaultOptions: { queries: { retry: false } } });
    render(
      <QueryClientProvider client={queryClient}>
        <WorkspaceResourceView resource={resource} workspaceId="workspace_1" />
      </QueryClientProvider>,
    );

    await user.click(screen.getByRole('tab', { name: 'Provenance' }));

    expect(await screen.findByText('Resource lineage')).toBeVisible();
    expect(screen.getByLabelText('Loading model delivery records')).toBeVisible();
    expect(screen.queryByText('No model delivery has been recorded yet.')).not.toBeInTheDocument();
  });

  it('presents provenance as semantic resource lineage with internal provider evidence collapsed', async () => {
    repository.resourceDeliveries.mockResolvedValueOnce([
      {
        id: 'delivery_1',
        workspace_id: 'workspace_1',
        resource_id: 'resource_1',
        resource_revision: 1,
        resource_sha256: 'abc',
        message_id: 'message_1',
        provider_id: 'provider_internal',
        model_id: 'model-visible',
        representation: 'structured_document',
        evidence_source: 'structured-derivative',
        evidence_generated_at: '2026-08-31T00:01:00Z',
        reason: 'Selected for the current request',
        delivered_at: '2026-08-31T00:02:00Z',
      },
    ]);
    const user = userEvent.setup();
    const queryClient = new QueryClient({
      defaultOptions: { queries: { retry: false } },
    });
    render(
      <QueryClientProvider client={queryClient}>
        <WorkspaceResourceView resource={resource} workspaceId="workspace_1" />
      </QueryClientProvider>,
    );

    await user.click(screen.getByRole('tab', { name: 'Provenance' }));

    expect(await screen.findByText('Resource lineage')).toBeVisible();
    expect(screen.getByText('Uploaded')).toBeVisible();
    expect(screen.getByText('Verified and registered')).toBeVisible();
    expect(await screen.findByText('Delivered to model')).toBeVisible();
    expect(screen.getByText(/model-visible/u)).toBeVisible();
    expect(screen.getByText('provider_internal')).not.toBeVisible();

    // Every timeline fact renders as its own sibling element — never a single middot-joined
    // string — so each can be found and styled independently.
    const uploadedItem = screen
      .getByText('Uploaded')
      .closest('[data-slot="timeline-item"]') as HTMLElement;
    expect(within(uploadedItem).getByText('4 B')).toBeVisible();
    const verifiedItem = screen
      .getByText('Verified and registered')
      .closest('[data-slot="timeline-item"]') as HTMLElement;
    expect(within(verifiedItem).getByText('Revision 1')).toBeVisible();
    const deliveredItem = screen
      .getByText('Delivered to model')
      .closest('[data-slot="timeline-item"]') as HTMLElement;
    // The service's own token is wire vocabulary, never the sentence a person reads.
    expect(within(deliveredItem).getByText('Structured document')).toBeVisible();
    expect(within(deliveredItem).queryByText('structured_document')).not.toBeInTheDocument();
    expect(screen.getByText('Complete')).toBeVisible();
    expect(screen.queryByText(/·/u)).not.toBeInTheDocument();
  });

  it('names a representation it does not recognise as unknown, keeping the token', async () => {
    repository.resourceDeliveries.mockResolvedValueOnce([
      {
        id: 'delivery_2',
        workspace_id: 'workspace_1',
        resource_id: 'resource_1',
        resource_revision: 1,
        resource_sha256: 'abc',
        message_id: 'message_1',
        provider_id: 'provider_internal',
        model_id: 'model-visible',
        representation: 'holographic',
        evidence_source: '',
        evidence_generated_at: '2026-08-31T00:01:00Z',
        reason: '',
        delivered_at: '2026-08-31T00:02:00Z',
      },
    ]);
    const user = userEvent.setup();
    const queryClient = new QueryClient({ defaultOptions: { queries: { retry: false } } });
    render(
      <QueryClientProvider client={queryClient}>
        <WorkspaceResourceView resource={resource} workspaceId="workspace_1" />
      </QueryClientProvider>,
    );

    await user.click(screen.getByRole('tab', { name: 'Provenance' }));

    expect(await screen.findByText('Unknown (holographic)')).toBeVisible();
  });
});
