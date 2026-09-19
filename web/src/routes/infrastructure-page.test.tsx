import { brand } from '@brand';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { cleanup, render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { MemoryRouter, Route, Routes } from 'react-router-dom';

const repository = vi.hoisted(() => ({
  serviceHealth: vi.fn(),
  relayStatus: vi.fn(),
  mcpServers: vi.fn(),
  effectiveAgentToolset: vi.fn(),
  catalogTools: vi.fn(),
  tools: vi.fn(),
  mcpConfiguration: vi.fn(),
  configureMcpServer: vi.fn(),
  removeMcpConfiguration: vi.fn(),
  configureRelay: vi.fn(),
  deleteMcpServer: vi.fn(),
  installMcpServer: vi.fn(),
  sandboxStatus: vi.fn(),
  setupSandbox: vi.fn(),
}));
const inTauriMock = vi.hoisted(() => vi.fn(() => false));
const restartClioMock = vi.hoisted(() => vi.fn().mockResolvedValue(undefined));

vi.mock('@/hooks/use-repository', () => ({ useRepository: () => repository }));
vi.mock('@/providers/connection-provider', () => ({
  useConnectionSettings: () => ({
    settings: { endpoint: 'http://127.0.0.1:8788', label: 'Contained' },
  }),
}));
vi.mock('@/lib/transport/tauri-runtime', () => ({ inTauri: inTauriMock }));
vi.mock('@/tauri/managed-backend', () => ({ restartClio: restartClioMock }));

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
  repository.effectiveAgentToolset.mockResolvedValue({
    agentId: 'main',
    sessionId: 'sess_demo',
    tools: [
      {
        name: 'fs_read_file',
        title: 'Read File',
        source: 'gateway',
        representation: 'row',
      },
      {
        name: 'wait_agent_tasks',
        title: 'Wait',
        source: 'spawn-runtime',
        representation: 'row',
      },
      {
        name: 'memory_search_sessions',
        title: 'Search memory',
        source: 'native',
        representation: 'row',
      },
    ],
  });
  repository.tools.mockResolvedValue([
    {
      id: 'create_artifact',
      name: 'create_artifact',
      title: 'Create artifact',
      description: 'Creates a durable workspace artifact.',
      source: 'builtin',
      tags: [],
      visible_to: [],
      input_schema: {
        type: 'object',
        required: ['title'],
        properties: { title: { type: 'string', description: 'Artifact title.' } },
      },
      output_schema: {
        type: 'object',
        properties: { artifact_id: { type: 'string', description: 'Created artifact identity.' } },
      },
    },
    {
      id: 'memory_search_sessions',
      name: 'memory_search_sessions',
      title: 'Search memory',
      source: 'builtin',
      tags: [],
      visible_to: [],
      input_schema: {},
      output_schema: {},
    },
    {
      id: 'ndp_search',
      name: 'ndp_search',
      title: 'Search NDP',
      description: 'Searches the National Data Platform catalog.',
      server_id: 'session_mcp_sess_demo_ndp',
      source: 'agent_blueprint_mcp_descriptor',
      tags: [],
      visible_to: [],
      input_schema: {
        type: 'object',
        properties: { query: { type: 'string' } },
      },
      output_schema: { type: 'object' },
    },
  ]);
  repository.catalogTools.mockResolvedValue([
    {
      id: 'create_artifact',
      name: 'create_artifact',
      title: 'Create artifact',
      description: 'Creates a durable workspace artifact.',
      source: 'builtin',
      tags: [],
      visible_to: [],
      input_schema: {},
      output_schema: {},
    },
    {
      id: 'memory_search_sessions',
      name: 'memory_search_sessions',
      title: 'Search memory',
      source: 'builtin',
      tags: [],
      visible_to: [],
      input_schema: {},
      output_schema: {},
    },
    {
      id: 'create_plan',
      name: 'create_plan',
      title: 'Create plan',
      source: 'builtin',
      tags: [],
      visible_to: [],
      input_schema: { type: 'object' },
      output_schema: { type: 'object' },
    },
  ]);
  repository.mcpConfiguration.mockResolvedValue({
    name: 'web',
    configured: false,
    scope: 'user',
    status: 'local_fallback',
    tools_count: 0,
    tools: [],
    retryable: false,
  });
  repository.configureMcpServer.mockResolvedValue({
    name: 'web',
    configured: true,
    scope: 'user',
    status: 'ready',
    transport: 'stdio',
    tools_count: 2,
    tools: ['web_search', 'web_fetch'],
    retryable: false,
  });
  repository.removeMcpConfiguration.mockResolvedValue({
    name: 'web',
    configured: false,
    scope: 'user',
    status: 'local_fallback',
    tools_count: 0,
    tools: [],
    retryable: false,
  });
  repository.sandboxStatus.mockResolvedValue({
    name: 'sandbox',
    status: 'ready',
    required: true,
    setup_in_progress: false,
  });
  inTauriMock.mockReturnValue(false);
  restartClioMock.mockClear();
});

afterEach(cleanup);

function renderPage(
  from = '/workspaces/ws_factorio/sessions/sess_demo',
  section: 'agent' | 'tools' | 'services' = 'services',
) {
  const client = new QueryClient({
    defaultOptions: { mutations: { retry: false }, queries: { retry: false } },
  });
  return render(
    <QueryClientProvider client={client}>
      <MemoryRouter
        initialEntries={[
          {
            pathname: `/infrastructure/${section}`,
            state: {
              endpoint: 'http://127.0.0.1:8788',
              from,
            },
          },
        ]}
      >
        <Routes>
          <Route element={<InfrastructurePage />} path="/infrastructure/:section?" />
        </Routes>
      </MemoryRouter>
    </QueryClientProvider>,
  );
}

describe('InfrastructurePage', () => {
  it('separates agent, tools, and services while opening on the requested section', async () => {
    renderPage('/workspaces/ws_factorio/sessions/sess_demo', 'tools');

    expect(screen.getByRole('main')).toHaveClass('h-dvh', 'overflow-y-auto');
    expect(await screen.findByRole('heading', { name: 'Tools', level: 1 })).toBeVisible();
    expect(screen.getByRole('navigation', { name: 'Infrastructure sections' })).toBeVisible();
    expect(screen.getByRole('link', { name: brand.agentName })).toBeVisible();
    expect(screen.getByRole('link', { name: 'Tools' })).toHaveAttribute('aria-current', 'page');
    expect(screen.getByRole('link', { name: 'Services' })).toBeVisible();
  });

  it('shows typed contracts for CLIO tools and tools from installed MCPs', async () => {
    const user = userEvent.setup();
    renderPage('/workspaces/ws_factorio/sessions/sess_demo', 'tools');

    expect(await screen.findByText('3 built in')).toBeVisible();
    expect(screen.getByRole('button', { name: 'Built-in 3' })).toHaveAttribute(
      'aria-pressed',
      'true',
    );
    expect(screen.getByRole('button', { name: /Create plan/u })).not.toBeVisible();
    await user.click(screen.getByText('Planning'));
    expect(screen.getByRole('button', { name: /Create plan/u })).toBeVisible();
    await user.click(screen.getByRole('button', { name: /Create artifact/u }));
    expect(screen.getByText('Creates a durable workspace artifact.')).toBeVisible();
    expect(screen.getByText('Inputs')).toBeVisible();
    expect(screen.getByText('title')).toBeVisible();
    expect(screen.getByText('required')).toBeVisible();
    expect(screen.getByText('Returns')).toBeVisible();
    expect(screen.getByText('artifact_id')).toBeVisible();
    await user.click(screen.getByRole('button', { name: 'MCP 1' }));
    expect(screen.getAllByText('EarthScope Skills')).toHaveLength(2);
    expect(screen.getByText('Session')).toBeVisible();
    expect(screen.getByRole('link', { name: 'EarthScope Skills' })).toHaveAttribute(
      'href',
      '/settings/blueprints?blueprint=earthscope-single-agent',
    );
    expect(repository.tools).toHaveBeenCalled();
    expect(repository.catalogTools).toHaveBeenCalled();
  });

  it('says why the relay is degraded in the relay’s own words', async () => {
    repository.relayStatus.mockResolvedValue({
      configured: true,
      reachable: false,
      reason: 'credential_rejected',
      detail: 'The relay rejected the stored credential (401).',
      details: {},
    });

    renderPage();

    expect(await screen.findByText('Needs attention')).toBeVisible();
    // "Needs attention" is a severity, not an explanation. The service already
    // said what is wrong; withholding it makes the card a dead end.
    expect(screen.getByText('The relay rejected the stored credential (401).')).toBeVisible();
  });

  it('keeps missing execution protection visible as a required problem, never "Optional"', async () => {
    repository.serviceHealth.mockResolvedValue({
      healthy: true,
      integrations: [
        { name: 'sandbox', status: 'degraded', required: true, details: {} },
      ],
    });
    repository.sandboxStatus.mockResolvedValue({
      name: 'sandbox',
      status: 'degraded',
      required: true,
      reason: 'codex_enforcement_unverified',
      setup_in_progress: false,
    });

    renderPage('/workspaces/ws_factorio/sessions/sess_demo', 'agent');

    expect(await screen.findByText('Protected execution')).toBeVisible();
    expect(await screen.findByText('Not verified yet on this computer')).toBeVisible();
    expect(screen.queryByText('Optional')).not.toBeInTheDocument();
    expect(screen.queryByRole('heading', { name: 'CLIO agent' })).not.toBeInTheDocument();
  });

  it('offers a "Set up protected execution" fix, not just a label', async () => {
    const user = userEvent.setup();
    repository.serviceHealth.mockResolvedValue({
      healthy: true,
      integrations: [{ name: 'sandbox', status: 'degraded', required: true, details: {} }],
    });
    repository.sandboxStatus.mockResolvedValue({
      name: 'sandbox',
      status: 'degraded',
      required: true,
      reason: 'codex_enforcement_unverified',
      setup_in_progress: false,
    });

    renderPage('/workspaces/ws_factorio/sessions/sess_demo', 'agent');

    await user.click(await screen.findByText('Protected execution'));
    expect(
      await screen.findByRole('button', { name: /Set up protected execution/u }),
    ).toBeVisible();
  });

  it('invalidates the sandbox row once setup settles, then polls it until the run clears', async () => {
    const user = userEvent.setup();
    repository.serviceHealth.mockResolvedValue({
      healthy: true,
      integrations: [{ name: 'sandbox', status: 'degraded', required: true, details: {} }],
    });
    repository.sandboxStatus
      .mockResolvedValueOnce({
        name: 'sandbox',
        status: 'degraded',
        required: true,
        reason: 'codex_enforcement_unverified',
        setup_in_progress: false,
      })
      // The GET the mutation's onSettled forces after a 409 — the real
      // 409 body itself carries none of these desktop-panel fields, only
      // this dedicated GET does, so this refetch is the only thing that
      // can ever put the row into its "in progress" state.
      .mockResolvedValueOnce({
        name: 'sandbox',
        status: 'degraded',
        required: true,
        reason: 'codex_enforcement_unverified',
        setup_in_progress: true,
      })
      .mockResolvedValue({
        name: 'sandbox',
        status: 'ready',
        required: true,
        setup_in_progress: false,
      });
    // A real 409/501 response body: status/reason/elevated only, no `row`
    // with setup_in_progress/reason/codex_source for the client to seed a
    // cache from.
    repository.setupSandbox.mockResolvedValue({
      status: 'sandbox_setup_in_progress',
      reason: 'sandbox_setup_in_progress',
      elevated: false,
    });

    renderPage('/workspaces/ws_factorio/sessions/sess_demo', 'agent');

    await user.click(await screen.findByText('Protected execution'));
    await user.click(
      await screen.findByRole('button', { name: /Set up protected execution/u }),
    );
    expect(repository.setupSandbox).toHaveBeenCalled();
    expect(await screen.findByText('Waiting for Windows permission prompt…')).toBeVisible();
    await waitFor(
      () =>
        expect(
          screen.queryByText('Waiting for Windows permission prompt…'),
        ).not.toBeInTheDocument(),
      { timeout: 3_000 },
    );
  });

  it('still picks up a running setup after the request itself times out', async () => {
    const user = userEvent.setup();
    repository.serviceHealth.mockResolvedValue({
      healthy: true,
      integrations: [{ name: 'sandbox', status: 'degraded', required: true, details: {} }],
    });
    repository.sandboxStatus
      .mockResolvedValueOnce({
        name: 'sandbox',
        status: 'degraded',
        required: true,
        reason: 'codex_enforcement_unverified',
        setup_in_progress: false,
      })
      // The setup run is real and still going server-side even though the
      // desktop bridge's own client-side wait gave up on it — onSettled
      // fires on a rejection exactly like it does on success, so this GET
      // still happens and still finds the run.
      .mockResolvedValueOnce({
        name: 'sandbox',
        status: 'degraded',
        required: true,
        reason: 'codex_enforcement_unverified',
        setup_in_progress: true,
      })
      .mockResolvedValue({
        name: 'sandbox',
        status: 'ready',
        required: true,
        setup_in_progress: false,
      });
    repository.setupSandbox.mockRejectedValue(new Error('the request timed out'));

    renderPage('/workspaces/ws_factorio/sessions/sess_demo', 'agent');

    await user.click(await screen.findByText('Protected execution'));
    await user.click(
      await screen.findByRole('button', { name: /Set up protected execution/u }),
    );
    expect(await screen.findByText('Waiting for Windows permission prompt…')).toBeVisible();
    await waitFor(
      () =>
        expect(
          screen.queryByText('Waiting for Windows permission prompt…'),
        ).not.toBeInTheDocument(),
      { timeout: 3_000 },
    );
  });

  it('hides the setup button once the connected service reports 501 (nothing to provision here)', async () => {
    const user = userEvent.setup();
    repository.serviceHealth.mockResolvedValue({
      healthy: true,
      integrations: [{ name: 'sandbox', status: 'degraded', required: true, details: {} }],
    });
    repository.sandboxStatus.mockResolvedValue({
      name: 'sandbox',
      status: 'degraded',
      required: true,
      reason: 'disabled_by_config',
      setup_in_progress: false,
    });
    repository.setupSandbox.mockResolvedValue({
      status: 'not_windows',
      reason: 'sandbox_setup_unsupported',
      elevated: false,
      row: {
        name: 'sandbox',
        status: 'degraded',
        required: true,
        reason: 'disabled_by_config',
        setup_in_progress: false,
      },
    });

    renderPage('/workspaces/ws_factorio/sessions/sess_demo', 'agent');

    await user.click(await screen.findByText('Protected execution'));
    await user.click(
      await screen.findByRole('button', { name: /Set up protected execution/u }),
    );
    await waitFor(() =>
      expect(
        screen.queryByRole('button', { name: /Set up protected execution/u }),
      ).not.toBeInTheDocument(),
    );
  });

  it('offers a Restart action once the reason is sandbox_fence_pending_restart', async () => {
    const user = userEvent.setup();
    repository.serviceHealth.mockResolvedValue({
      healthy: true,
      integrations: [{ name: 'sandbox', status: 'degraded', required: true, details: {} }],
    });
    repository.sandboxStatus.mockResolvedValue({
      name: 'sandbox',
      status: 'degraded',
      required: true,
      reason: 'sandbox_fence_pending_restart',
      setup_in_progress: false,
    });

    // Browser session (inTauriMock defaults to false): an instruction, not a button that can't act here.
    renderPage('/workspaces/ws_factorio/sessions/sess_demo', 'agent');
    await user.click(await screen.findByText('Protected execution'));
    expect(await screen.findByText(/Set up, restart/u)).toBeVisible();
    expect(
      screen.getByText(/Restart .* to activate protected execution/u),
    ).toBeVisible();
    expect(screen.queryByRole('button', { name: /Restart/u })).not.toBeInTheDocument();
    cleanup();

    // Desktop session: a real "Restart CLIO" button wired to the restart command.
    inTauriMock.mockReturnValue(true);
    renderPage('/workspaces/ws_factorio/sessions/sess_demo', 'agent');
    await user.click(await screen.findByText('Protected execution'));
    await user.click(await screen.findByRole('button', { name: /Restart/u }));
    expect(restartClioMock).toHaveBeenCalled();
  });

  it('falls back to the relay’s typed reason when it sent no prose detail', async () => {
    repository.relayStatus.mockResolvedValue({
      configured: true,
      reachable: false,
      reason: 'credential_rejected',
      details: {},
    });

    renderPage();

    expect(await screen.findByText('Credential rejected')).toBeVisible();
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

    await user.click(await screen.findByRole('button', { name: /Connect web search/u }));
    expect(screen.queryByRole('radio')).not.toBeInTheDocument();
    expect(screen.getByText('Connect an existing service')).toBeVisible();
    expect(
      screen.getByText(/Search and HTML fetches can appear to work without it/u),
    ).toBeVisible();
    const address = screen.getByLabelText('Service address');
    await user.clear(address);
    await user.type(address, 'http://10.0.0.102:8089');
    await user.click(screen.getByRole('button', { name: 'Connect to agent' }));

    await waitFor(() =>
      expect(repository.configureMcpServer).toHaveBeenCalledWith('web', {
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

  it('keeps an unreachable remote configuration visible and retryable', async () => {
    repository.mcpConfiguration.mockResolvedValue({
      name: 'web',
      configured: true,
      scope: 'user',
      status: 'degraded',
      transport: 'stdio',
      tools_count: 0,
      tools: [],
      spec: {
        args: ['clio-kit', 'mcp-server', 'web', '--remote-url', 'http://offline:8089'],
      },
      error: 'ConnectionError: service offline',
      retryable: true,
    });
    const user = userEvent.setup();
    renderPage();

    await user.click(await screen.findByRole('button', { name: /Repair connection/u }));
    expect(await screen.findByDisplayValue('http://offline:8089')).toBeVisible();
    expect(screen.getByText('Configuration saved, service unavailable')).toBeVisible();
    expect(screen.getByRole('button', { name: 'Retry connection' })).toBeVisible();
    expect(screen.getByRole('button', { name: 'Use local engines' })).toBeVisible();
  });

  it('keeps Web Search and Relay setup aligned at the same top position and width', async () => {
    const user = userEvent.setup();
    renderPage();

    await user.click(await screen.findByRole('button', { name: /Connect web search/u }));
    expect(screen.getByRole('dialog')).toHaveClass('top-[10dvh]', 'translate-y-0', 'sm:max-w-2xl');
    await user.click(screen.getByRole('button', { name: 'Close' }));

    await user.click(screen.getByRole('button', { name: 'Connect Relay' }));
    expect(screen.getByRole('dialog')).toHaveClass('top-[10dvh]', 'translate-y-0', 'sm:max-w-2xl');
  });
});
