import type {
  WorkspaceResourceDerivative,
  WorkspaceResourceProcessing,
} from '@clio/core/v3';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { cleanup, render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { WorkspaceResourceDerivativesView } from './workspace-resource-derivatives';

const repository = {
  reprocessResource: vi.fn(),
  resourceDerivativeContent: vi.fn(),
};

vi.mock('@/hooks/use-repository', () => ({ useRepository: () => repository }));

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
  created_at: '2026-08-31T12:00:00Z',
  updated_at: '2026-08-31T12:00:01Z',
};

function renderView(derivatives: WorkspaceResourceDerivative[] = [derivative]) {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  return render(
    <QueryClientProvider client={client}>
      <WorkspaceResourceDerivativesView
        derivatives={derivatives}
        processing={processing}
        resourceId="resource_1"
        workspaceId="workspace_1"
      />
    </QueryClientProvider>,
  );
}

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
});
