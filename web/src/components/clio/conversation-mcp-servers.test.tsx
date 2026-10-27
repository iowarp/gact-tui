import type { McpServerDefinition } from '@clio/core/v3';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';

const repository = vi.hoisted(() => ({ reconnectSessionMcpServer: vi.fn() }));

vi.mock('@/hooks/use-repository', () => ({ useRepository: () => repository }));
vi.mock('@/providers/connection-provider', () => ({
  useConnectionSettings: () => ({ settings: { endpoint: 'http://127.0.0.1:8790' } }),
}));

import { ConversationMcpServers } from './conversation-mcp-servers';

afterEach(() => {
  cleanup();
  vi.clearAllMocks();
});

function server(overrides: Partial<McpServerDefinition>): McpServerDefinition {
  return {
    id: 'session_mcp_sess_1_spotter',
    name: 'spotter',
    status: 'ready',
    tools_count: 0,
    tools: [],
    source: 'plugin',
    plugin: 'spotter',
    session_id: 'sess_1',
    spec: {},
    ...overrides,
  };
}

function renderServers(servers: McpServerDefinition[]) {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  return render(
    <QueryClientProvider client={client}>
      <ConversationMcpServers servers={servers} sessionId="sess_1" tools={[]} />
    </QueryClientProvider>,
  );
}

describe('ConversationMcpServers', () => {
  it('shows a preparing server with its phase in words, not only an icon', () => {
    renderServers([
      server({ status: 'preparing', preparation: { state: 'preparing', phase: 'launch' } }),
    ]);
    expect(screen.getAllByText('Preparing (starting)').length).toBeGreaterThan(0);
    expect(screen.queryByRole('button', { name: /Reconnect/u })).toBeNull();
  });

  it('shows a failure in plain words, its reason behind Details, and reconnects it', async () => {
    repository.reconnectSessionMcpServer.mockResolvedValue({
      session_id: 'sess_1',
      namespace: 'spotter',
      state: 'preparing',
    });
    renderServers([
      server({
        status: 'failed',
        reason: 'mcp_prepare_provision_failed',
        preparation: {
          state: 'failed',
          phase: 'provision',
          reason: 'mcp_prepare_provision_failed',
          detail: 'uv sync exited 2: TOML parse error',
        },
      }),
      server({ id: 'mcp_other', name: 'other', session_id: undefined }),
    ]);

    expect(screen.getByText('The server’s software could not be installed.')).toBeInTheDocument();
    expect(screen.queryByText('other')).toBeNull(); // not this conversation's server
    expect(screen.queryByText(/TOML parse error/u)).toBeNull();
    fireEvent.click(screen.getByRole('button', { name: 'Details' }));
    expect(screen.getByText(/TOML parse error/u)).toBeInTheDocument();
    expect(screen.getByText('mcp_prepare_provision_failed')).toBeInTheDocument();

    fireEvent.click(screen.getByRole('button', { name: 'Reconnect spotter' }));
    await waitFor(() =>
      expect(repository.reconnectSessionMcpServer).toHaveBeenCalledWith('sess_1', 'spotter'),
    );
  });

  it('renders nothing when the conversation brings no servers', () => {
    const { container } = renderServers([server({ session_id: 'another' })]);
    expect(container).toBeEmptyDOMElement();
  });
});
