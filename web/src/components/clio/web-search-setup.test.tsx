import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { cleanup, render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

const repository = vi.hoisted(() => ({
  externalServiceConnections: vi.fn(),
  mcpConfiguration: vi.fn(),
  createExternalServiceConnection: vi.fn(),
  updateExternalServiceConnection: vi.fn(),
  checkExternalServiceConnection: vi.fn(),
  deleteExternalServiceConnection: vi.fn(),
  configureMcpServer: vi.fn(),
  removeMcpConfiguration: vi.fn(),
}));

vi.mock('@/hooks/use-repository', () => ({ useRepository: () => repository }));
vi.mock('@/providers/connection-provider', () => ({
  useConnectionSettings: () => ({ settings: { endpoint: 'http://127.0.0.1:17800' } }),
}));

import { WebSearchSetup } from './web-search-setup';

const external = {
  id: 'external-1',
  service_id: 'web_search',
  label: 'CLIO Web Search',
  url: 'https://search.example.edu',
  credential_ref: 'nsf',
  managed: false as const,
  reachable: true,
  checked_at: '2026-09-21T00:00:00Z',
  created_at: '2026-09-21T00:00:00Z',
};

function renderSetup(onOpenChange = vi.fn()) {
  render(
    <QueryClientProvider client={new QueryClient()}>
      <WebSearchSetup onOpenChange={onOpenChange} open />
    </QueryClientProvider>,
  );
  return onOpenChange;
}

beforeEach(() => {
  repository.externalServiceConnections.mockResolvedValue([]);
  repository.mcpConfiguration.mockResolvedValue({});
  repository.createExternalServiceConnection.mockResolvedValue(external);
  repository.configureMcpServer.mockResolvedValue({ status: 'ready', tools_count: 3 });
  repository.checkExternalServiceConnection.mockResolvedValue(external);
  repository.removeMcpConfiguration.mockResolvedValue(undefined);
  repository.deleteExternalServiceConnection.mockResolvedValue(undefined);
});

afterEach(() => {
  cleanup();
  vi.clearAllMocks();
});

describe('WebSearchSetup', () => {
  it('creates a connection-only record before connecting the MCP adapter', async () => {
    const user = userEvent.setup();
    const onOpenChange = renderSetup();
    await user.type(await screen.findByLabelText('Service address'), 'https://search.example.edu');
    await user.type(screen.getByLabelText('Credential reference'), 'nsf');
    await user.click(screen.getByRole('button', { name: 'Connect' }));

    await waitFor(() =>
      expect(repository.createExternalServiceConnection).toHaveBeenCalledWith({
        service_id: 'web_search',
        label: 'CLIO Web Search',
        url: 'https://search.example.edu',
        credential_ref: 'nsf',
      }),
    );
    expect(repository.configureMcpServer).toHaveBeenCalled();
    expect(onOpenChange).toHaveBeenCalledWith(false);
  });

  it('rechecks and fully disconnects an existing external endpoint', async () => {
    repository.externalServiceConnections.mockResolvedValue([external]);
    repository.mcpConfiguration.mockResolvedValue({
      spec: { args: ['mcp-server', 'web', '--remote-url', external.url] },
    });
    const user = userEvent.setup();
    const onOpenChange = renderSetup();

    await user.click(await screen.findByRole('button', { name: 'Recheck' }));
    await waitFor(() =>
      expect(repository.checkExternalServiceConnection).toHaveBeenCalledWith('external-1'),
    );
    await user.click(screen.getByRole('button', { name: 'Disconnect' }));

    await waitFor(() => expect(repository.removeMcpConfiguration).toHaveBeenCalledWith('web'));
    expect(repository.deleteExternalServiceConnection).toHaveBeenCalledWith('external-1');
    expect(onOpenChange).toHaveBeenCalledWith(false);
  });
});
