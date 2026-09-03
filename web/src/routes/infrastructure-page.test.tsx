import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { cleanup, render, screen, waitFor, within } from '@testing-library/react';
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
    {
      id: 'session_mcp_sess_demo_ndp',
      name: 'ndp',
      status: 'available',
      transport: 'stdio',
      tools_count: 0,
      tools: [],
      source: 'agent_blueprint',
      agent_blueprint_id: 'earthscope-single-agent',
      agent_blueprint_name: 'EarthScope Skills',
      session_id: 'sess_demo',
      spec: {},
    },
  ]);
  repository.installMcpServer.mockResolvedValue({ id: 'mcp_ext_web' });
});

afterEach(cleanup);

function renderPage(from = '/workspaces/ws_factorio/sessions/sess_demo') {
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
              from,
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
    expect(await screen.findByText('EarthScope Skills')).toBeVisible();
    expect(await screen.findByText('Starts on use')).toBeVisible();
    expect(repository.mcpServers).toHaveBeenCalledWith('ws_factorio', expect.any(AbortSignal), {
      sessionId: 'sess_demo',
    });
  });

  it('groups only the servers this session actually owns', async () => {
    renderPage();

    // `fs` and `shell` carry no session_id at all. Comparing `undefined` against
    // an absent session once put every shared service under the session's own
    // heading — the exact inversion of what the grouping is for.
    const shared = (await screen.findByText('Shared tools')).closest('section');
    expect(shared).not.toBeNull();
    expect(within(shared!).getByText('Files')).toBeVisible();
    expect(within(shared!).getByText('Commands')).toBeVisible();

    const session = screen.getByText('EarthScope Skills').closest('section');
    expect(within(session!).getByText('Ndp')).toBeVisible();
    expect(within(session!).queryByText('Files')).not.toBeInTheDocument();
  });

  it('lists services ungrouped when no session is in view', async () => {
    renderPage('/workspaces/ws_factorio');

    expect(await screen.findByText('Files')).toBeVisible();
    expect(screen.queryByText('Shared tools')).not.toBeInTheDocument();
    expect(screen.queryByText('Session tools')).not.toBeInTheDocument();
    expect(repository.mcpServers).toHaveBeenCalledWith(
      undefined,
      expect.any(AbortSignal),
      // No session in the return route means none is asked for, so nothing the
      // service answers with can be attributed to one.
      { sessionId: undefined },
    );
  });

  it('says so when the service ignored the session it was asked about', async () => {
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
    ]);

    renderPage();

    expect(
      await screen.findByText(
        'This service did not report which session each tool belongs to, so they are not grouped.',
      ),
    ).toBeVisible();
    expect(screen.queryByText('Shared tools')).not.toBeInTheDocument();
  });

  it('describes and names a service from what the service itself reported', async () => {
    repository.mcpServers.mockResolvedValue([
      {
        id: 'session_mcp_sess_demo_ndp',
        name: 'ndp',
        status: 'ready',
        transport: 'stdio',
        tools_count: 4,
        tools: [],
        session_id: 'sess_demo',
        spec: { title: 'Station catalog', description: 'Answers about seismic stations' },
      },
    ]);

    renderPage();

    expect(await screen.findByText('Station catalog')).toBeVisible();
    expect(screen.getByText(/Answers about seismic stations/u)).toBeVisible();
    // The client used to carry demo copy for a fixed set of server names. A
    // service the client has never heard of must not be described from a
    // hardcoded table, and one that describes itself must not be overridden.
    expect(screen.queryByText(/EarthScope station and product data/u)).not.toBeInTheDocument();
  });

  it('shows a failed service its own status word rather than a generic degrade', async () => {
    repository.mcpServers.mockResolvedValue([
      {
        id: 'mcp_broken',
        name: 'broken',
        status: 'start_failed',
        transport: 'stdio',
        tools_count: 0,
        tools: [],
        error: 'The command exited with status 127.',
        spec: {},
      },
    ]);

    renderPage();

    expect(await screen.findByText('Start failed')).toBeVisible();
    expect(screen.queryByText('Degraded')).not.toBeInTheDocument();
  });

  it('counts every listed service in the footer, including one with no tools', async () => {
    renderPage();

    expect(await screen.findByText('2 of 3 ready')).toBeVisible();
    // A ready service that exposes zero tools is a real, reportable state; the
    // falsy check that hid it made "no tools" indistinguishable from "unknown".
    expect(screen.getByText(/0 tools/u)).toBeVisible();
  });

  it('connects a running Web Search service as a structured MCP', async () => {
    repository.mcpServers.mockResolvedValue([
      {
        id: 'unrelated_web_search',
        name: 'CLIO Web Search',
        status: 'failed',
        transport: 'stdio',
        tools_count: 0,
        tools: [],
        spec: { command: 'someone-elses-server' },
      },
    ]);
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
    expect(repository.deleteMcpServer).not.toHaveBeenCalled();
  });
});
