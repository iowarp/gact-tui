import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { act, cleanup, render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

const profiles = vi.hoisted(() => ({
  listSshProfiles: vi.fn(),
  listAllSshProfiles: vi.fn(),
  saveSshProfile: vi.fn(),
  deleteSshProfile: vi.fn(),
  setSshProfileHidden: vi.fn(),
  setSshProfileRoute: vi.fn(),
}));
const credentials = vi.hoisted(() => ({ storeSshIdentity: vi.fn() }));
const transport = vi.hoisted(() => ({
  openSshConnectionTest: vi.fn(),
  closeSshConnectionTest: vi.fn(),
  sshTransportStatus: vi.fn(),
}));

vi.mock('@/tauri/ssh-profiles', () => profiles);
vi.mock('@/tauri/ssh-credentials', () => credentials);
vi.mock('@/tauri/ssh-infrastructure-transport', () => transport);

import { SshHostsManagerDialog } from './ssh-hosts-manager-dialog';

function renderManager(open = true) {
  const onOpenChange = vi.fn();
  return {
    onOpenChange,
    ...render(
      <QueryClientProvider client={new QueryClient()}>
        <SshHostsManagerDialog onOpenChange={onOpenChange} open={open} />
      </QueryClientProvider>,
    ),
  };
}

beforeEach(() => {
  profiles.listAllSshProfiles.mockResolvedValue([
    { name: 'ares', label: 'Ares', hostname: 'ares.example.edu', managed: true, hidden: false },
    {
      name: 'gateway',
      label: 'gateway',
      hostname: 'gw.example.edu',
      managed: false,
      hidden: true,
    },
  ]);
  profiles.setSshProfileHidden.mockResolvedValue(undefined);
});

afterEach(() => {
  cleanup();
  vi.clearAllMocks();
});

describe('SshHostsManagerDialog', () => {
  it('lists both managed and imported hosts, hidden ones included', async () => {
    renderManager();

    expect(await screen.findByText('Ares')).toBeVisible();
    expect(screen.getByText('gateway')).toBeVisible();
    expect(screen.getAllByText('Managed')).toHaveLength(1);
    expect(screen.getAllByText('Imported')).toHaveLength(1);
    expect(screen.getByText('Hidden')).toBeVisible();
  });

  it('hides a visible host', async () => {
    const user = userEvent.setup();
    renderManager();
    await screen.findByText('Ares');

    await user.click(screen.getByRole('button', { name: 'Hide Ares' }));

    await waitFor(() => expect(profiles.setSshProfileHidden).toHaveBeenCalledWith('ares', true));
  });

  it('unhides a hidden host, restoring it', async () => {
    const user = userEvent.setup();
    renderManager();
    await screen.findByText('gateway');

    await user.click(screen.getByRole('button', { name: 'Show gateway' }));

    await waitFor(() =>
      expect(profiles.setSshProfileHidden).toHaveBeenCalledWith('gateway', false),
    );
  });

  it('flips visibility at once, stays open, and never re-lists every host', async () => {
    const user = userEvent.setup();
    let finish: () => void = () => undefined;
    profiles.setSshProfileHidden.mockReturnValue(
      new Promise<void>((resolve) => {
        finish = resolve;
      }),
    );
    const { onOpenChange } = renderManager();
    await screen.findByText('Ares');

    await user.click(screen.getByRole('button', { name: 'Hide Ares' }));

    // Before the preference write finishes, the row already reads Hidden and
    // its toggle stays usable (no disabled state to drop focus).
    expect(screen.getByRole('button', { name: 'Show Ares' })).toBeEnabled();
    expect(screen.getAllByText('Hidden')).toHaveLength(2);
    await act(async () => finish());
    expect(onOpenChange).not.toHaveBeenCalled();
    expect(screen.getByRole('dialog', { name: 'Manage SSH hosts' })).toBeVisible();
    expect(profiles.listAllSshProfiles).toHaveBeenCalledTimes(1);
  });

  it('puts the row back and says why when the preference cannot be saved', async () => {
    const user = userEvent.setup();
    profiles.setSshProfileHidden.mockRejectedValue(new Error('Could not write preferences'));
    renderManager();
    await screen.findByText('Ares');

    await user.click(screen.getByRole('button', { name: 'Hide Ares' }));

    expect(await screen.findByText('Could not write preferences')).toBeVisible();
    expect(screen.getByRole('button', { name: 'Hide Ares' })).toBeVisible();
  });

  it('configures a managed host but offers no configure action for an imported one', async () => {
    renderManager();
    await screen.findByText('Ares');

    expect(screen.getByRole('button', { name: 'Configure Ares' })).toBeVisible();
    expect(screen.queryByRole('button', { name: 'Configure gateway' })).not.toBeInTheDocument();
  });
});
