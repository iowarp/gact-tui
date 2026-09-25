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
  transport.writeSshTransport.mockResolvedValue(undefined);
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
      { emptyRows: [] },
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
        { emptyRows: [] },
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
      {
        name: 'utah',
        label: 'Utah cluster',
        hostname: 'login.utah.edu',
        jump_hosts: ['gw'],
        managed: true,
      },
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

    await user.click(await screen.findByRole('button', { name: 'Configure Gateway' }));
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
    expect(onChange).toHaveBeenLastCalledWith(expect.objectContaining({ jumpHosts: [] }), {
      emptyRows: [],
    });
  });

  it('reorders the route so the last hop becomes the destination', async () => {
    const user = userEvent.setup();
    profiles.listSshProfiles.mockResolvedValue([
      {
        name: 'utah',
        label: 'Utah cluster',
        hostname: 'login.utah.edu',
        jump_hosts: ['gw'],
        managed: true,
      },
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

    // Removing the destination promotes whatever hop is now last — the same
    // recomputation a drag-and-drop reorder commits.
    await user.click(await screen.findByRole('button', { name: 'Remove destination' }));

    expect(onChange).toHaveBeenCalledWith(
      expect.objectContaining({ id: 'profile:gw', label: 'Gateway', jumpHosts: [] }),
      { emptyRows: [] },
    );
  });

  it('keeps a jump host its own route when it is configured', async () => {
    const user = userEvent.setup();
    profiles.listSshProfiles.mockResolvedValue([
      {
        name: 'dest',
        label: 'Destination',
        hostname: 'dest.edu',
        jump_hosts: ['gw'],
        managed: true,
      },
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

    await user.click(await screen.findByRole('button', { name: 'Configure Gateway' }));
    await user.clear(screen.getByLabelText('Name'));
    await user.type(screen.getByLabelText('Name'), 'Campus gateway');
    await user.click(screen.getByRole('button', { name: 'Save host' }));

    await waitFor(() =>
      expect(profiles.saveSshProfile).toHaveBeenCalledWith(
        expect.objectContaining({
          name: 'gw',
          label: 'Campus gateway',
          jump_hosts: ['bastion'],
          replace_existing: true,
        }),
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
        expect.objectContaining({ name: 'gateway-2', replace_existing: false }),
      ),
    );
  });

  it('keeps the OpenSSH prompt in its own form, separate from Save host (#1437)', async () => {
    const user = userEvent.setup();
    transport.openSshConnectionTest.mockResolvedValue({
      targetId: 'ssh-test-host',
      status: {
        session_id: 'ssh-test-session',
        state: 'reauthentication_required',
        reused: false,
        output: 'Password: ',
        prompt: { kind: 'password', text: 'Password:', context: 'Password:' },
      },
    });
    // Never resolves: keeps the prompt open through this test without a
    // repeating background poll. The single 250ms sleep already in flight
    // when the test ends fires once, harmlessly, touching no React state.
    transport.sshTransportStatus.mockReturnValue(new Promise(() => {}));
    renderPicker();

    await user.click(screen.getByRole('button', { name: 'Add SSH host' }));
    await user.type(screen.getByLabelText('Address'), 'utah.example.edu');
    await user.click(screen.getByRole('button', { name: 'Test connection' }));

    await screen.findByText('Password');

    // Root cause of #1437: SshAuthentication renders its own <form> to answer
    // one OpenSSH prompt. It must never be a DOM descendant of the host
    // dialog's own <form onSubmit={submit}> (Save host) — nested <form>
    // elements are invalid HTML, and the resulting native `submit` bubbles
    // from the inner form into the outer one.
    for (const form of document.querySelectorAll('form')) {
      expect(form.querySelector('form')).toBeNull();
    }

    await user.type(screen.getByLabelText('Password:'), 'super-secret');
    await user.click(screen.getByRole('button', { name: 'Continue' }));

    expect(transport.writeSshTransport).toHaveBeenCalledWith('ssh-test-session', 'super-secret\n');
    // Answering the prompt must only answer the prompt: no save, no close.
    expect(profiles.saveSshProfile).not.toHaveBeenCalled();
    expect(await screen.findByRole('dialog')).toBeVisible();
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

  it('adding a hop and configuring it saves a new computer as the destination', async () => {
    const user = userEvent.setup();
    profiles.listSshProfiles.mockResolvedValue([
      { name: 'ares', label: 'Ares', hostname: 'ares.example.edu', managed: true },
    ]);
    const onChange = vi.fn();
    const destination = {
      id: 'profile:ares',
      label: 'Ares',
      profile: 'ares',
      host: 'ares.example.edu',
      port: 22,
      jumpHosts: [],
      managed: true,
    };
    render(
      <QueryClientProvider client={new QueryClient()}>
        <SshHostPicker onChange={onChange} value={destination} />
      </QueryClientProvider>,
    );

    await user.click(await screen.findByRole('button', { name: 'Add hop' }));
    await user.click(screen.getByRole('button', { name: 'Add SSH host' }));
    await user.type(screen.getByLabelText('Address'), 'node042.ares.example.edu');
    await user.type(screen.getByLabelText('Name'), 'Ares compute node');
    await user.click(screen.getByRole('button', { name: 'Save host' }));

    await waitFor(() =>
      expect(profiles.saveSshProfile).toHaveBeenCalledWith(
        expect.objectContaining({ hostname: 'node042.ares.example.edu' }),
      ),
    );
    // Ares was the destination; adding and configuring a new hop after it
    // makes the new computer the destination and Ares its jump host.
    expect(onChange).toHaveBeenLastCalledWith(
      expect.objectContaining({ label: 'Ares compute node', jumpHosts: ['ares'] }),
      { emptyRows: [] },
    );
  });

  it('shows no prompt form while OpenSSH is only connecting, and never for ssh>', async () => {
    const user = userEvent.setup();
    transport.openSshConnectionTest.mockResolvedValue({
      targetId: 'ssh-test-host',
      status: {
        session_id: 'ssh-test-session',
        state: 'reauthentication_required',
        reused: false,
        output: '\r\nssh>',
        prompt: null,
      },
    });
    transport.sshTransportStatus.mockReturnValue(new Promise(() => {}));
    renderPicker();

    await user.click(screen.getByRole('button', { name: 'Add SSH host' }));
    await user.type(screen.getByLabelText('Address'), 'utah.example.edu');
    await user.click(screen.getByRole('button', { name: 'Test connection' }));

    await screen.findByRole('button', { name: 'Testing…' });
    expect(screen.queryByRole('button', { name: 'Continue' })).not.toBeInTheDocument();
    expect(screen.queryByText('ssh>')).not.toBeInTheDocument();
  });

  it('adds a hop before choosing any computer and fills both rows', async () => {
    const user = userEvent.setup();
    profiles.listSshProfiles.mockResolvedValue([
      { name: 'ares', label: 'Ares', hostname: 'ares.example.edu', managed: true },
      { name: 'node42', label: 'node42', hostname: 'node42', managed: false },
    ]);
    const { onChange } = renderPicker();

    await user.click(await screen.findByRole('button', { name: 'Add hop' }));
    expect(onChange).toHaveBeenLastCalledWith(undefined, { emptyRows: [0, 1] });
    await user.click(screen.getByRole('combobox', { name: 'Jump host 1' }));
    await user.click(await screen.findByRole('option', { name: 'Ares' }));
    expect(onChange).toHaveBeenLastCalledWith(undefined, { emptyRows: [1] });
    await user.click(screen.getByRole('combobox', { name: 'Saved SSH host' }));
    await user.click(await screen.findByRole('option', { name: 'node42' }));

    expect(onChange).toHaveBeenLastCalledWith(
      expect.objectContaining({ profile: 'node42', jumpHosts: ['ares'] }),
      { emptyRows: [] },
    );
  });

  it('offers no inline hide action; visibility is managed elsewhere', async () => {
    profiles.listSshProfiles.mockResolvedValue([
      { name: 'imported', label: 'imported', hostname: 'imported.example.edu', managed: false },
    ]);
    render(
      <QueryClientProvider client={new QueryClient()}>
        <SshHostPicker
          onChange={vi.fn()}
          value={{
            id: 'profile:imported',
            label: 'imported',
            profile: 'imported',
            host: 'imported.example.edu',
            port: 22,
            jumpHosts: [],
            managed: false,
          }}
        />
      </QueryClientProvider>,
    );

    await screen.findByRole('button', { name: 'Configure imported' });
    expect(screen.queryByRole('button', { name: /hide/iu })).not.toBeInTheDocument();
    expect(screen.queryByText('Hide imported computer')).not.toBeInTheDocument();
  });

  it('only offers deleting a managed computer, never an imported one', async () => {
    profiles.listSshProfiles.mockResolvedValue([
      { name: 'ares', label: 'Ares', hostname: 'ares.example.edu', managed: true },
    ]);
    const destination = {
      id: 'profile:ares',
      label: 'Ares',
      profile: 'ares',
      host: 'ares.example.edu',
      port: 22,
      jumpHosts: [],
      managed: true,
    };
    render(
      <QueryClientProvider client={new QueryClient()}>
        <SshHostPicker onChange={vi.fn()} value={destination} />
      </QueryClientProvider>,
    );

    expect(await screen.findByRole('button', { name: 'Delete Ares' })).toBeVisible();
  });
});
