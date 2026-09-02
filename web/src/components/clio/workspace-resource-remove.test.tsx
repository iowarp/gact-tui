import type { WorkspaceResource } from '@clio/core/v3';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { cleanup, render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { queryKeys } from '@/lib/query-keys';
import { WorkspaceResourceRemoveAction } from './workspace-resource-remove';

const ENDPOINT = 'http://127.0.0.1:8790';

const repository = vi.hoisted(() => ({ deleteResource: vi.fn() }));
const toast = vi.hoisted(() => ({ error: vi.fn(), success: vi.fn() }));

vi.mock('@/hooks/use-repository', () => ({ useRepository: () => repository }));
vi.mock('@/providers/connection-provider', () => ({
  useConnectionSettings: () => ({ settings: { endpoint: ENDPOINT } }),
}));
vi.mock('sonner', () => ({ toast }));

afterEach(() => {
  cleanup();
  vi.clearAllMocks();
});

function workspaceResource(overrides: Partial<WorkspaceResource> = {}): WorkspaceResource {
  return {
    id: 'resource_1',
    workspace_id: 'workspace_1',
    client_upload_id: 'upload_1',
    revision: 1,
    name: 'quarantined.bin',
    claimed_mime: 'application/octet-stream',
    detected_mime: 'application/octet-stream',
    detection_source: 'signature',
    declared_size: 12,
    received_size: 12,
    sha256: 'abc',
    state: 'quarantined',
    failure: 'The scanner rejected this file.',
    created_at: '2026-08-31T00:00:00Z',
    updated_at: '2026-08-31T00:00:00Z',
    completed_at: '2026-08-31T00:00:00Z',
    mime_mismatch: false,
    ...overrides,
  };
}

function renderAction(resource = workspaceResource()) {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  client.setQueryData(queryKeys.workspaceResources(ENDPOINT, 'workspace_1'), [resource]);
  render(
    <QueryClientProvider client={client}>
      <WorkspaceResourceRemoveAction resource={resource} workspaceId="workspace_1" />
    </QueryClientProvider>,
  );
  return client;
}

describe('WorkspaceResourceRemoveAction', () => {
  it('removes a quarantined resource once the person confirms, and refreshes the list', async () => {
    repository.deleteResource.mockResolvedValue(undefined);
    const user = userEvent.setup();
    const client = renderAction();

    await user.click(screen.getByRole('button', { name: 'Remove quarantined.bin' }));
    expect(screen.getByRole('alertdialog')).toBeVisible();
    await user.click(screen.getByRole('button', { name: 'Remove resource' }));

    await waitFor(() =>
      expect(repository.deleteResource).toHaveBeenCalledWith('workspace_1', 'resource_1'),
    );
    await waitFor(() =>
      expect(
        client.getQueryState(queryKeys.workspaceResources(ENDPOINT, 'workspace_1'))?.isInvalidated,
      ).toBe(true),
    );
  });

  it('does nothing when the person backs out', async () => {
    const user = userEvent.setup();
    renderAction();

    await user.click(screen.getByRole('button', { name: 'Remove quarantined.bin' }));
    await user.click(screen.getByRole('button', { name: 'Keep resource' }));

    expect(repository.deleteResource).not.toHaveBeenCalled();
  });

  it('reports the service failure rather than pretending the resource is gone', async () => {
    repository.deleteResource.mockRejectedValue(new Error('Resource is in use by a running turn.'));
    const user = userEvent.setup();
    renderAction();

    await user.click(screen.getByRole('button', { name: 'Remove quarantined.bin' }));
    await user.click(screen.getByRole('button', { name: 'Remove resource' }));

    await waitFor(() =>
      expect(toast.error).toHaveBeenCalledWith('Resource is in use by a running turn.'),
    );
    expect(toast.success).not.toHaveBeenCalled();
  });

  it('offers no removal while the bytes are still arriving', () => {
    renderAction(workspaceResource({ name: 'arriving.bin', state: 'uploading' }));

    expect(screen.queryByRole('button', { name: /^Remove/u })).not.toBeInTheDocument();
  });
});
