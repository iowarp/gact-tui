import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { cleanup, render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, expect, it, vi } from 'vitest';
import { BlueprintInstallView } from './blueprint-install-view';
import { queryKeys } from '@/lib/query-keys';

const repository = vi.hoisted(() => ({ installAgentBlueprint: vi.fn() }));
vi.mock('@/hooks/use-repository', () => ({ useRepository: () => repository }));
vi.mock('@/providers/connection-provider', () => ({
  useConnectionSettings: () => ({ settings: { endpoint: 'http://connected-clio:8787' } }),
}));
afterEach(() => {
  cleanup();
  vi.clearAllMocks();
});

it('shows a failed installation and retries the same source and workspace', async () => {
  const user = userEvent.setup();
  const queries = new QueryClient({ defaultOptions: { mutations: { retry: false } } });
  const invalidate = vi.spyOn(queries, 'invalidateQueries');
  repository.installAgentBlueprint.mockRejectedValueOnce(new Error('Source is unavailable'));
  repository.installAgentBlueprint.mockResolvedValueOnce({ installed: [{ id: 'demo' }] });
  render(
    <QueryClientProvider client={queries}>
      <BlueprintInstallView
        workspaceId="workspace-b"
        blueprint={{
          id: 'workspace::src-b::demo',
          registry_id: 'src-b',
          blueprint_id: 'demo',
          display_name: 'Research agent',
          scope: 'workspace',
          enabled: true,
          materialized: false,
        }}
      />
    </QueryClientProvider>,
  );
  expect(repository.installAgentBlueprint).not.toHaveBeenCalled();
  expect(screen.getByText('http://connected-clio:8787')).toBeVisible();
  await user.click(screen.getByRole('button', { name: 'Install to browse files' }));
  expect(await screen.findByRole('alert')).toHaveTextContent('Source is unavailable');
  expect(invalidate).not.toHaveBeenCalled();
  await user.click(screen.getByRole('button', { name: 'Install to browse files' }));
  await waitFor(() =>
    expect(invalidate).toHaveBeenCalledWith({
      queryKey: queryKeys.agentBlueprints('http://connected-clio:8787'),
    }),
  );
  expect(repository.installAgentBlueprint.mock.calls).toEqual([
    [{ source_id: 'src-b', blueprint_id: 'demo', scope: 'workspace', workspace_id: 'workspace-b' }],
    [{ source_id: 'src-b', blueprint_id: 'demo', scope: 'workspace', workspace_id: 'workspace-b' }],
  ]);
});
