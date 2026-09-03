import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { cleanup, render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { MemoryRouter, Route, Routes } from 'react-router-dom';

const repository = vi.hoisted(() => ({
  serviceHealth: vi.fn(),
  relayStatus: vi.fn(),
  mcpServers: vi.fn(),
  configureRelay: vi.fn(),
  deleteMcpServer: vi.fn(),
  installMcpServer: vi.fn(),
}));

vi.mock('@/hooks/use-repository', () => ({ useRepository: () => repository }));
vi.mock('@/providers/connection-provider', () => ({
  useConnectionSettings: () => ({
    settings: { endpoint: 'http://127.0.0.1:8788', label: 'Contained' },
  }),
}));
vi.mock('@/lib/transport/tauri-runtime', () => ({ inTauri: () => false }));

import { InfrastructurePage } from './infrastructure-page';

beforeEach(() => {
  localStorage.clear();
  vi.clearAllMocks();
  repository.serviceHealth.mockResolvedValue({
    healthy: true,
    integrations: [{ name: 'api', status: 'ready' }],
  });
  repository.relayStatus.mockResolvedValue({
    configured: false,
    reachable: false,
    details: {},
  });
  repository.mcpServers.mockResolvedValue([
    {
      id: 'mcp_fs',
      name: 'fs',
      status: 'ready',
      transport: 'in_process',
      tools_count: 3,
      tools: [],
      spec: {},
    },
    {
      id: 'mcp_shell',
      name: 'shell',
      status: 'ready',
      transport: 'in_process',
      tools_count: 1,
      tools: [],
      spec: {},
    },
  ]);
  repository.installMcpServer.mockResolvedValue({ id: 'mcp_ext_web' });
});

afterEach(cleanup);

function renderPage() {
  const client = new QueryClient({
    defaultOptions: { mutations: { retry: false }, queries: { retry: false } },
  });
  return render(
    <QueryClientProvider client={client}>
      <MemoryRouter
        initialEntries={[
          {
            pathname: '/infrastructure',
            state: {
              endpoint: 'http://127.0.0.1:8788',
              from: '/workspaces/ws_factorio/sessions/sess_demo',
            },
          },
        ]}
      >
        <Routes>
          <Route element={<InfrastructurePage />} path="/infrastructure" />
        </Routes>
      </MemoryRouter>
    </QueryClientProvider>,
  );
}

describe('InfrastructurePage', () => {
  it('presents user outcomes while identifying built-in MCP services', async () => {
    renderPage();

    expect(await screen.findByRole('heading', { name: 'Agent capabilities' })).toBeVisible();
    expect(screen.getByRole('heading', { name: 'Research and documents' })).toBeVisible();
    expect(screen.getByRole('heading', { name: 'Remote computers' })).toBeVisible();
    expect(await screen.findAllByText('Built-in MCP')).toHaveLength(2);
    expect(await screen.findByText('Files')).toBeVisible();
    expect(await screen.findByText('Commands')).toBeVisible();
    expect(repository.mcpServers).toHaveBeenCalledWith('ws_factorio', expect.any(AbortSignal));
  });

  it('connects a running Web Search service as a structured MCP', async () => {
    const user = userEvent.setup();
    renderPage();

    await user.click(await screen.findByRole('button', { name: /Set up web search/u }));
    await user.click(screen.getByRole('radio', { name: /Already running/u }));
    const address = screen.getByLabelText('Service address');
    await user.clear(address);
    await user.type(address, 'http://10.0.0.102:8089');
    await user.click(screen.getByRole('button', { name: 'Connect to agent' }));

    await waitFor(() =>
      expect(repository.installMcpServer).toHaveBeenCalledWith({
        name: 'CLIO Web Search',
        transport: 'stdio',
        command: 'uvx',
        args: [
          '--from',
          'clio-kit==2.10.5',
          'clio-kit',
          'mcp-server',
          'web',
          '--remote-url',
          'http://10.0.0.102:8089',
        ],
      }),
    );
  });
});
