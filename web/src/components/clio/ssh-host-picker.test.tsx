import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { cleanup, render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { vocab } from '@/lib/brand-vocabulary';

const profiles = vi.hoisted(() => ({
  listSshProfiles: vi.fn(),
  saveSshProfile: vi.fn(),
  deleteSshProfile: vi.fn(),
  setSshProfileHidden: vi.fn(),
  setSshProfileRoute: vi.fn(),
}));
const credentials = vi.hoisted(() => ({
  storeSshIdentity: vi.fn(),
}));
const transport = vi.hoisted(() => ({
  openSshConnectionTest: vi.fn(),
  closeSshConnectionTest: vi.fn(),
  sshTransportStatus: vi.fn(),
  writeSshTransport: vi.fn(),
}));

vi.mock('@/tauri/ssh-profiles', () => profiles);
vi.mock('@/tauri/ssh-credentials', () => credentials);
vi.mock('@/tauri/ssh-infrastructure-transport', () => transport);

import { SshHostPicker } from './ssh-host-picker';

function renderPicker(onChange = vi.fn()) {
  return {
    onChange,
    ...render(
      <QueryClientProvider client={new QueryClient()}>
        <SshHostPicker onChange={onChange} />
      </QueryClientProvider>,
    ),
  };
}

beforeEach(() => {
  localStorage.clear();
  profiles.listSshProfiles.mockResolvedValue([]);
  profiles.saveSshProfile.mockImplementation(async (input) => ({
    name: input.name,
    hostname: input.hostname,
    user: input.user,
    port: input.port,
    identity_file: input.identity_file || undefined,
    jump_hosts: input.jump_hosts,
    platform: input.platform,
    managed: true,
  }));
  credentials.storeSshIdentity.mockResolvedValue('/protected/id_ed25519');
  transport.openSshConnectionTest.mockResolvedValue({
    targetId: 'ssh-test-host',
    status: {
      session_id: 'ssh-test-session',
      state: 'connected',
      reused: false,
      output: '__CLIO_SSH_READY__',
    },
  });
  transport.closeSshConnectionTest.mockResolvedValue(undefined);
});

afterEach(() => {
  cleanup();
  vi.clearAllMocks();
});

describe('SshHostPicker', () => {
  it('uses interactive OpenSSH without presenting password as a stored authentication mode', async () => {
    const user = userEvent.setup();
    renderPicker();

    await user.click(screen.getByRole('button', { name: 'Add SSH host' }));

    expect(screen.queryByRole('tab', { name: 'Password' })).not.toBeInTheDocument();
    expect(screen.getByText('OpenSSH authentication')).toBeVisible();
    expect(screen.getByText(/prompts come directly from system OpenSSH/u)).toBeVisible();
    expect(screen.queryByLabelText('Password', { selector: 'input' })).not.toBeInTheDocument();
    expect(screen.getByLabelText('Paste a private key')).toBeVisible();
    expect(screen.getByRole('button', { name: 'Choose key file' })).toBeVisible();
    expect(screen.getByRole('button', { name: 'Test connection' })).toBeVisible();
    expect(screen.getByText('Connection route')).toBeVisible();
  });

  it('saves only non-secret host metadata for interactive authentication', async () => {
    const user = userEvent.setup();
    const { onChange } = renderPicker();

    await user.click(screen.getByRole('button', { name: 'Add SSH host' }));
    await user.type(screen.getByLabelText('Address'), '10.0.0.102');
    await user.type(screen.getByLabelText('Username'), 'alice');
    await user.click(screen.getByRole('button', { name: 'Save host' }));

    await waitFor(() => expect(onChange).toHaveBeenCalled());
    expect(onChange).toHaveBeenCalledWith(
      expect.objectContaining({
        host: '10.0.0.102',
        user: 'alice',
      }),
    );
    expect(profiles.saveSshProfile).toHaveBeenCalledWith(
      expect.objectContaining({ hostname: '10.0.0.102', user: 'alice' }),
    );
    expect(JSON.stringify(profiles.saveSshProfile.mock.calls)).not.toContain('password');
  });

  it('saves an optional persistent CLIO install and runtime location with the host', async () => {
    const user = userEvent.setup();
    const { onChange } = renderPicker();

    await user.click(screen.getByRole('button', { name: 'Add SSH host' }));
    await user.type(screen.getByLabelText('Address'), 'ares.example.edu');
    await user.click(screen.getByText('Advanced host settings'));
    await user.type(
      screen.getByLabelText(`${vocab.agent} install and runtime location`),
      '/mnt/common/alice/clio',
    );
    await user.click(screen.getByRole('button', { name: 'Save host' }));

    await waitFor(() =>
      expect(onChange).toHaveBeenCalledWith(
        expect.objectContaining({ installRoot: '/mnt/common/alice/clio' }),
      ),
    );
    expect(profiles.saveSshProfile).toHaveBeenCalledWith(
      expect.not.objectContaining({ installRoot: expect.anything() }),
    );
  });

  it('tests the configured route through the real interactive transport contract', async () => {
    const user = userEvent.setup();
    profiles.listSshProfiles.mockResolvedValue([
      { name: 'chpc-gateway', label: 'CHPC gateway', hostname: 'gw.chpc.utah.edu', managed: true },
    ]);
    renderPicker();

    await user.click(screen.getByRole('button', { name: 'Add SSH host' }));
    await user.type(screen.getByLabelText('Address'), 'notchpeak1.chpc.utah.edu');
    await user.type(screen.getByLabelText('Username'), 'u1282901');
    await user.click(screen.getByRole('combobox', { name: 'New jump host' }));
    await user.click(screen.getByRole('option', { name: 'CHPC gateway' }));
    await user.click(screen.getByRole('button', { name: 'Test connection' }));

    await screen.findByText('Connection succeeded');
    expect(transport.openSshConnectionTest).toHaveBeenCalledWith({
      profile: '',
      host: 'notchpeak1.chpc.utah.edu',
      user: 'u1282901',
      port: 22,
      jump_hosts: ['chpc-gateway'],
      identity_file: '',
      platform: 'auto',
    });
    expect(transport.closeSshConnectionTest).toHaveBeenCalledWith(
      expect.objectContaining({ targetId: 'ssh-test-host' }),
    );
  });

  it('configures a jump host in the same dialog and persists the reordered route', async () => {
    const user = userEvent.setup();
    profiles.listSshProfiles.mockResolvedValue([
      { name: 'utah', label: 'Utah cluster', hostname: 'login.utah.edu', jump_hosts: ['gw'], managed: true },
      { name: 'gw', label: 'Gateway', hostname: 'gw.utah.edu', user: 'alice', managed: true },
    ]);
    const onChange = vi.fn();
    const destination = {
      id: 'profile:utah',
      label: 'Utah cluster',
      profile: 'utah',
      host: 'login.utah.edu',
      port: 22,
      jumpHosts: ['gw'],
      platform: 'auto' as const,
      managed: true,
    };
    render(
      <QueryClientProvider client={new QueryClient()}>
        <SshHostPicker onChange={onChange} value={destination} />
      </QueryClientProvider>,
    );

    await user.click(await screen.findByRole('button', { name: 'Configure jump host 1' }));
    const dialog = await screen.findByRole('dialog');
    expect(dialog).toHaveTextContent('Configure Gateway');
    expect(screen.getByLabelText('Address')).toHaveValue('gw.utah.edu');
    expect(screen.getByLabelText('Username')).toHaveValue('alice');
    // A jump host is a computer like any other: the same fields, no nested route.
    expect(screen.queryByText('Connection route')).not.toBeInTheDocument();
    await user.click(screen.getByRole('button', { name: 'Save host' }));
    await waitFor(() =>
      expect(profiles.saveSshProfile).toHaveBeenCalledWith(
        expect.objectContaining({ name: 'gw', hostname: 'gw.utah.edu', jump_hosts: [] }),
      ),
    );

    await user.click(screen.getByRole('button', { name: 'Remove jump host 1' }));
    // Only the route is written back, never the rest of the saved profile.
    await waitFor(() => expect(profiles.setSshProfileRoute).toHaveBeenCalledWith('utah', []));
    expect(profiles.saveSshProfile).toHaveBeenCalledTimes(1);
    expect(onChange).toHaveBeenLastCalledWith(expect.objectContaining({ jumpHosts: [] }));
  });

  it('keeps a jump host its own route when it is configured', async () => {
    const user = userEvent.setup();
    profiles.listSshProfiles.mockResolvedValue([
      { name: 'dest', label: 'Destination', hostname: 'dest.edu', jump_hosts: ['gw'], managed: true },
      { name: 'gw', label: 'Gateway', hostname: 'gw.edu', jump_hosts: ['bastion'], managed: true },
    ]);
    render(
      <QueryClientProvider client={new QueryClient()}>
        <SshHostPicker
          onChange={vi.fn()}
          value={{
            id: 'profile:dest',
            label: 'Destination',
            profile: 'dest',
            host: 'dest.edu',
            port: 22,
            jumpHosts: ['gw'],
            managed: true,
          }}
        />
      </QueryClientProvider>,
    );

    await user.click(await screen.findByRole('button', { name: 'Configure jump host 1' }));
    await user.clear(screen.getByLabelText('Name'));
    await user.type(screen.getByLabelText('Name'), 'Campus gateway');
    await user.click(screen.getByRole('button', { name: 'Save host' }));

    await waitFor(() =>
      expect(profiles.saveSshProfile).toHaveBeenCalledWith(
        expect.objectContaining({ name: 'gw', label: 'Campus gateway', jump_hosts: ['bastion'] }),
      ),
    );
  });

  it('never saves a new computer under an existing OpenSSH alias', async () => {
    const user = userEvent.setup();
    profiles.listSshProfiles.mockResolvedValue([
      { name: 'gateway', label: 'gateway', hostname: 'gw.example.edu', managed: false },
    ]);
    renderPicker();

    await user.click(await screen.findByRole('button', { name: 'Add SSH host' }));
    await user.type(screen.getByLabelText('Address'), 'gw2.example.edu');
    await user.type(screen.getByLabelText('Name'), 'Gateway');
    await user.click(screen.getByRole('button', { name: 'Save host' }));

    await waitFor(() =>
      expect(profiles.saveSshProfile).toHaveBeenCalledWith(
        expect.objectContaining({ name: 'gateway-2' }),
      ),
    );
  });

  it('says a route edit on an imported OpenSSH host applies to this deployment only', async () => {
    const user = userEvent.setup();
    profiles.listSshProfiles.mockResolvedValue([
      { name: 'cluster', label: 'cluster', hostname: 'c.edu', jump_hosts: ['gw'], managed: false },
      { name: 'gw', label: 'gw', hostname: 'gw.edu', managed: false },
    ]);
    render(
      <QueryClientProvider client={new QueryClient()}>
        <SshHostPicker
          onChange={vi.fn()}
          value={{
            id: 'profile:cluster',
            label: 'cluster',
            profile: 'cluster',
            host: 'c.edu',
            port: 22,
            jumpHosts: ['gw'],
            managed: false,
          }}
        />
      </QueryClientProvider>,
    );

    await user.click(await screen.findByRole('button', { name: 'Remove jump host 1' }));

    expect(await screen.findByText(/used for this deployment only/u)).toBeVisible();
    expect(profiles.setSshProfileRoute).not.toHaveBeenCalled();
    expect(profiles.saveSshProfile).not.toHaveBeenCalled();
  });
});
