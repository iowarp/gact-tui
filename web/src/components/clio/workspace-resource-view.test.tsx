import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { render, screen } from '@testing-library/react';
import type { WorkspaceResource } from '@clio/core/v3';
import { describe, expect, it, vi } from 'vitest';
import { WorkspaceResourceView } from './workspace-resource-view';

const repository = vi.hoisted(() => ({
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
    collections: {},
    resource_id: 'resource_1',
    revision: 1,
  }),
}));

vi.mock('@/hooks/use-repository', () => ({ useRepository: () => repository }));
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
  it('uses the shared PDF.js viewer instead of the unreliable native object plugin', async () => {
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
  });
});
