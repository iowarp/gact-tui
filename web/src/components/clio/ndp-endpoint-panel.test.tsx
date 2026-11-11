import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { cleanup, fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { MemoryRouter } from 'react-router-dom';
import { afterEach, beforeEach, expect, it, vi } from 'vitest';
import { NDPEndpointPanel } from './ndp-endpoint-panel';

const fixture = vi.hoisted(() => ({
  repository: {
    ndpEndpointConnections: vi.fn(),
    connectNdpEndpoint: vi.fn(),
    requestNdpEndpoint: vi.fn(),
    ndpEndpointCaptures: vi.fn(),
    disconnectNdpEndpoint: vi.fn(),
    updateNdpEndpoint: vi.fn(),
    infrastructureTargets: vi.fn(),
    connectedSshProfiles: vi.fn(),
    createInfrastructureTarget: vi.fn(),
  },
}));
vi.mock('@/hooks/use-repository', () => ({ useRepository: () => fixture.repository }));
vi.mock('@/providers/connection-provider', () => ({
  useConnectionSettings: () => ({ settings: { endpoint: 'https://clio.test', token: '' } }),
}));
const endpoint = {
  id: 'ep',
  name: 'Ares',
  url: 'http://127.0.0.1:8002',
  ssh_profile: 'ares',
  authentication: 'none',
  workspace_id: 'ws',
  observed_at: '2026-10-18',
  api_title: 'NDP',
  operations: [
    {
      id: 'GET /stations',
      path: '/stations',
      method: 'GET',
      summary: 'Find stations',
      description: 'Station metadata',
      parameters: [
        { name: 'limit', in: 'query', schema: { anyOf: [{ type: 'integer' }, { type: 'null' }] } },
      ],
      body_schema: null,
      body_required: false,
      read_only: true,
    },
    {
      id: 'POST /sessions',
      path: '/sessions',
      method: 'POST',
      summary: 'Start stream',
      description: 'Create a producer',
      parameters: [],
      body_schema: { type: 'object' },
      body_required: true,
      read_only: false,
    },
  ],
};
beforeEach(() => {
  vi.resetAllMocks();
  fixture.repository.infrastructureTargets.mockResolvedValue([]);
  fixture.repository.connectedSshProfiles.mockResolvedValue({ profiles: ['ares'] });
  fixture.repository.ndpEndpointConnections.mockResolvedValue({ endpoints: [endpoint] });
  fixture.repository.connectNdpEndpoint.mockResolvedValue(endpoint);
  fixture.repository.ndpEndpointCaptures.mockResolvedValue({ captures: [] });
  fixture.repository.updateNdpEndpoint.mockImplementation(async (_workspace, _id, update) => ({
    ...endpoint,
    ...update,
  }));
  fixture.repository.disconnectNdpEndpoint.mockResolvedValue({ disconnected: true });
  fixture.repository.requestNdpEndpoint.mockResolvedValue({
    id: 'sample',
    resource_id: 'res_capture',
    status_code: 200,
    bytes_received: 15,
    events: 0,
    stop_reason: 'completed',
    sha256: '1234567890abc',
    preview: 'station,east\nA,1',
    workspace_path: '/workspace/inputs/stations.txt',
    source_artifact_id: 'artifact_capture',
  });
});
afterEach(cleanup);
function show() {
  return render(
    <MemoryRouter>
      <QueryClientProvider
        client={new QueryClient({ defaultOptions: { queries: { retry: false } } })}
      >
        <NDPEndpointPanel workspaceId="ws" signedIn onBack={vi.fn()} />
      </QueryClientProvider>
    </MemoryRouter>,
  );
}

it('runs a discovered read with typed optional parameters and an openable capture', async () => {
  show();
  fireEvent.click(await screen.findByText('Advanced API tools'));
  fireEvent.click(await screen.findByRole('button', { name: /Find stations/ }));
  fireEvent.change(screen.getByLabelText('limit'), { target: { value: '3' } });
  fireEvent.click(screen.getByRole('button', { name: 'Run and save response' }));
  await screen.findByRole('link', { name: 'Open captured response' });
  expect(fixture.repository.requestNdpEndpoint).toHaveBeenCalledWith('ws', 'ep', {
    operation_id: 'GET /stations',
    parameters: { limit: 3 },
    max_seconds: 10,
    max_events: 100,
  });
  expect(screen.getByText(/Saved in workspace Sources/)).toBeVisible();
});
it('requires review before sending a remote state-changing request', async () => {
  show();
  fireEvent.click(await screen.findByText('Advanced API tools'));
  fireEvent.click(await screen.findByRole('button', { name: /Start stream/ }));
  fireEvent.change(screen.getByLabelText('Request JSON'), {
    target: { value: '{"sncl_codes":["ANMO"]}' },
  });
  fireEvent.click(screen.getByRole('button', { name: 'Review action' }));
  expect(fixture.repository.requestNdpEndpoint).not.toHaveBeenCalled();
  expect(screen.getByRole('alert')).toHaveTextContent('POST /sessions on Ares');
  fireEvent.click(screen.getByRole('button', { name: 'Confirm operation' }));
  await waitFor(() => expect(fixture.repository.requestNdpEndpoint).toHaveBeenCalledTimes(1));
});
it('connects SSH explicitly and filters the observed operation list', async () => {
  fixture.repository.ndpEndpointConnections.mockResolvedValue({ endpoints: [] });
  show();
  await screen.findByRole('button', { name: 'SSH' });
  fireEvent.click(screen.getByRole('button', { name: 'SSH' }));
  expect(screen.getByLabelText('API sign-in')).toHaveValue('none');
  expect(screen.getByText('Your SSH connection is authenticated separately.')).toBeVisible();
  expect(screen.getByText(/No NDP account token is sent/)).toBeVisible();
  fireEvent.change(screen.getByLabelText('Name'), { target: { value: 'Ares' } });
  await userEvent.click(await screen.findByRole('combobox', { name: 'Saved SSH host' }));
  await userEvent.click(await screen.findByRole('option', { name: 'ares' }));
  fireEvent.change(screen.getByLabelText('Remote API URL'), {
    target: { value: 'http://127.0.0.1:8002' },
  });
  fireEvent.click(screen.getByRole('button', { name: 'Connect' }));
  fireEvent.click(await screen.findByText('Advanced API tools'));
  await screen.findByRole('button', { name: /Find stations/ });
  expect(fixture.repository.connectNdpEndpoint).toHaveBeenCalledWith('ws', {
    name: 'Ares',
    url: 'http://127.0.0.1:8002',
    ssh_profile: '',
    ssh_route: {
      profile: 'ares',
      host: '',
      user: '',
      port: 22,
      jump_hosts: [],
      identity_file: '',
      platform: 'auto',
    },
    authentication: 'none',
  });
  fireEvent.change(screen.getByLabelText('Search endpoint actions'), {
    target: { value: 'stream' },
  });
  expect(screen.queryByRole('button', { name: /Find stations/ })).not.toBeInTheDocument();
  expect(screen.getByRole('button', { name: /Start stream/ })).toBeInTheDocument();
});

it('uses the shared host dialog for a custom compute destination behind a saved login host', async () => {
  const user = userEvent.setup();
  fixture.repository.ndpEndpointConnections.mockResolvedValue({ endpoints: [] });
  fixture.repository.createInfrastructureTarget.mockImplementation(async (input) => ({
    ...input,
    id: 'compute',
  }));
  show();
  await user.click(await screen.findByRole('button', { name: 'SSH' }));
  await user.type(screen.getByLabelText('Name'), 'Compute endpoint');
  await user.click(screen.getByRole('combobox', { name: 'Saved SSH host' }));
  await user.click(await screen.findByRole('option', { name: 'ares' }));
  await user.click(screen.getByRole('button', { name: 'Add hop' }));
  expect(screen.getByRole('button', { name: 'Connect' })).toBeDisabled();
  await user.click(screen.getByRole('button', { name: 'Add SSH host' }));
  const dialog = within(screen.getByRole('dialog'));
  await user.type(dialog.getByLabelText('Address'), 'ares-comp-11');
  await user.type(dialog.getByLabelText('Username'), 'scientist');
  fireEvent.change(dialog.getByLabelText('Port'), { target: { value: '2222' } });
  await user.type(dialog.getByLabelText(/^Key file on the connected/), 'D:/keys/science key');
  expect(dialog.queryByText('Paste a private key')).not.toBeInTheDocument();
  await user.click(dialog.getByRole('button', { name: 'Save host' }));
  await waitFor(() => expect(screen.queryByRole('dialog')).not.toBeInTheDocument());
  expect(fixture.repository.connectNdpEndpoint).not.toHaveBeenCalled();
  await user.type(screen.getByLabelText('Remote API URL'), 'http://127.0.0.1:8002');
  await user.click(screen.getByRole('button', { name: 'Connect' }));
  await waitFor(() =>
    expect(fixture.repository.connectNdpEndpoint).toHaveBeenCalledWith('ws', {
      name: 'Compute endpoint',
      url: 'http://127.0.0.1:8002',
      ssh_profile: '',
      authentication: 'none',
      ssh_route: {
        profile: '',
        host: 'ares-comp-11',
        user: 'scientist',
        port: 2222,
        jump_hosts: ['ares'],
        identity_file: 'D:/keys/science key',
        platform: 'auto',
      },
    }),
  );
});

it('retains the saved shared host route when selecting a compute connection', async () => {
  const user = userEvent.setup();
  fixture.repository.ndpEndpointConnections.mockResolvedValue({ endpoints: [] });
  fixture.repository.infrastructureTargets.mockResolvedValue([
    {
      id: 'compute',
      kind: 'ssh',
      label: 'Compute node',
      ssh: { host: 'compute.example', jump_hosts: ['ares'], port: 2222 },
    },
  ]);
  show();
  await user.click(await screen.findByRole('button', { name: 'SSH' }));
  await user.type(screen.getByLabelText('Name'), 'Lab');
  await user.click(screen.getByRole('combobox', { name: 'Saved SSH host' }));
  await user.click(await screen.findByRole('option', { name: 'Compute node' }));
  await user.type(screen.getByLabelText('Remote API URL'), 'http://127.0.0.1:8002');
  await user.click(screen.getByRole('button', { name: 'Connect' }));
  await waitFor(() =>
    expect(fixture.repository.connectNdpEndpoint).toHaveBeenCalledWith(
      'ws',
      expect.objectContaining({
        ssh_route: expect.objectContaining({
          host: 'compute.example',
          port: 2222,
          jump_hosts: ['ares'],
        }),
      }),
    ),
  );
});

it('saves endpoint edits without replacing the saved identity', async () => {
  show();
  await userEvent.click(await screen.findByRole('button', { name: 'Endpoint actions' }));
  fireEvent.click(screen.getByRole('menuitem', { name: 'Edit endpoint' }));
  expect(screen.getByLabelText('Name')).toHaveValue('Ares');
  fireEvent.change(screen.getByLabelText('Name'), { target: { value: 'Research endpoint' } });
  fireEvent.click(screen.getByRole('button', { name: 'Save endpoint' }));
  await waitFor(() =>
    expect(fixture.repository.updateNdpEndpoint).toHaveBeenCalledWith('ws', 'ep', {
      name: 'Research endpoint',
      url: endpoint.url,
      ssh_profile: 'ares',
      ssh_route: null,
      authentication: 'none',
    }),
  );
  expect(
    await screen.findByRole('option', { name: 'Research endpoint (SSH ares)' }),
  ).toBeInTheDocument();
});

it('hides and restores endpoints through the same persisted connection', async () => {
  show();
  await userEvent.click(await screen.findByRole('button', { name: 'Endpoint actions' }));
  fireEvent.click(screen.getByRole('menuitem', { name: 'Hide endpoint' }));
  fireEvent.click(await screen.findByRole('button', { name: 'Show hidden endpoints (1)' }));
  await userEvent.click(screen.getByRole('button', { name: 'Endpoint actions' }));
  fireEvent.click(screen.getByRole('menuitem', { name: 'Show endpoint' }));
  await waitFor(() =>
    expect(fixture.repository.updateNdpEndpoint).toHaveBeenLastCalledWith('ws', 'ep', {
      hidden: false,
    }),
  );
  expect(fixture.repository.updateNdpEndpoint).toHaveBeenCalledWith('ws', 'ep', { hidden: true });
  expect(screen.queryByRole('button', { name: /Show hidden endpoints/ })).not.toBeInTheDocument();
});

it('does not remove an endpoint until its confirmation is accepted', async () => {
  show();
  await userEvent.click(await screen.findByRole('button', { name: 'Endpoint actions' }));
  fireEvent.click(screen.getByRole('menuitem', { name: 'Remove endpoint…' }));
  expect(screen.getByRole('alertdialog')).toHaveTextContent('Captured files stay in Sources');
  expect(fixture.repository.disconnectNdpEndpoint).not.toHaveBeenCalled();
  fireEvent.click(screen.getByRole('button', { name: 'Cancel' }));
  expect(fixture.repository.disconnectNdpEndpoint).not.toHaveBeenCalled();
  await userEvent.click(screen.getByRole('button', { name: 'Endpoint actions' }));
  fireEvent.click(screen.getByRole('menuitem', { name: 'Remove endpoint…' }));
  fireEvent.click(screen.getByRole('button', { name: 'Remove endpoint' }));
  await waitFor(() =>
    expect(fixture.repository.disconnectNdpEndpoint).toHaveBeenCalledWith('ws', 'ep'),
  );
});

it('reuses the connected NDP account when configuring another endpoint', async () => {
  show();
  fireEvent.click(screen.getByRole('button', { name: 'Connect endpoint' }));
  fireEvent.change(screen.getByLabelText('API sign-in'), { target: { value: 'ndp' } });
  expect(screen.getByText(/Send your saved NDP account token to this API/)).toBeVisible();
  expect(screen.queryByRole('button', { name: 'Sign in to NDP' })).not.toBeInTheDocument();
});
