import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { cleanup, render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { vocab } from '@/lib/brand-vocabulary';

const mocks = vi.hoisted(() => ({
  deployClio: vi.fn(),
  getManagedBackend: vi.fn(),
  preflightTarget: vi.fn(),
  retryManagedBackend: vi.fn(),
  sshProfiles: vi.fn(),
  waitForManagedBackend: vi.fn(),
}));

vi.mock('@/tauri/infrastructure-setup', () => ({
  deployClio: mocks.deployClio,
  preflightTarget: mocks.preflightTarget,
  sshProfiles: mocks.sshProfiles,
}));
vi.mock('@/tauri/managed-backend', () => ({
  getManagedBackend: mocks.getManagedBackend,
  retryManagedBackend: mocks.retryManagedBackend,
  waitForManagedBackend: mocks.waitForManagedBackend,
}));

import { DeployClioDialog } from './deploy-clio-dialog';

function renderDialog(onReady = vi.fn()) {
  render(
    <QueryClientProvider client={new QueryClient()}>
      <DeployClioDialog onReady={onReady} />
    </QueryClientProvider>,
  );
  return onReady;
}

beforeEach(() => {
  localStorage.clear();
  mocks.deployClio.mockReset();
  mocks.getManagedBackend.mockReset();
  mocks.preflightTarget.mockReset();
  mocks.retryManagedBackend.mockReset();
  mocks.sshProfiles.mockReset();
  mocks.waitForManagedBackend.mockReset();
  mocks.getManagedBackend.mockResolvedValue({
    url: '',
    bearer_token: '',
    status: { kind: 'starting', detail: 'checking_existing' },
  });
  mocks.sshProfiles.mockResolvedValue([{ name: 'homelab', hostname: '10.0.0.102', user: 'alice' }]);
});

afterEach(cleanup);

describe('DeployClioDialog', () => {
  it('uses the desktop-managed CLIO service for this computer', async () => {
    const user = userEvent.setup();
    const onReady = renderDialog();
    mocks.waitForManagedBackend.mockResolvedValue({
      url: 'http://127.0.0.1:17800',
      bearer_token: 'local-token',
      status: { kind: 'ready' },
    });

    await user.click(screen.getByRole('button', { name: `Deploy ${vocab.agent}` }));
    await user.click(screen.getByRole('button', { name: `Use local ${vocab.agent}` }));

    await waitFor(() =>
      expect(onReady).toHaveBeenCalledWith({
        endpoint: 'http://127.0.0.1:17800',
        token: 'local-token',
        label: 'This computer',
      }),
    );
    expect(mocks.deployClio).not.toHaveBeenCalled();
  });

  it('retries a failed local backend before waiting for readiness', async () => {
    const user = userEvent.setup();
    const onReady = renderDialog();
    mocks.getManagedBackend.mockResolvedValue({
      url: '',
      bearer_token: '',
      status: { kind: 'error', detail: 'previous boot failed' },
    });
    mocks.waitForManagedBackend.mockResolvedValue({
      url: 'http://127.0.0.1:64201',
      bearer_token: 'local-token',
      status: { kind: 'ready' },
    });

    await user.click(screen.getByRole('button', { name: `Deploy ${vocab.agent}` }));
    await user.click(screen.getByRole('button', { name: `Use local ${vocab.agent}` }));

    await waitFor(() => expect(onReady).toHaveBeenCalledOnce());
    expect(mocks.retryManagedBackend).toHaveBeenCalledOnce();
    expect(mocks.retryManagedBackend.mock.invocationCallOrder[0]).toBeLessThan(
      mocks.waitForManagedBackend.mock.invocationCallOrder[0],
    );
  });

  it('deploys through an imported SSH profile and returns a tunneled connection', async () => {
    const user = userEvent.setup();
    const onReady = renderDialog();
    mocks.deployClio.mockResolvedValue({
      target: 'homelab',
      remote_port: 17_800,
      status: 'installed',
    });

    await user.click(screen.getByRole('button', { name: `Deploy ${vocab.agent}` }));
    await user.click(screen.getByRole('radio', { name: /Remote host/u }));
    await user.click(await screen.findByRole('combobox', { name: 'Saved SSH host' }));
    await user.click(screen.getByRole('option', { name: /homelab/u }));
    await user.click(screen.getByRole('button', { name: 'Deploy and connect' }));

    await waitFor(() =>
      expect(onReady).toHaveBeenCalledWith({
        endpoint: 'http://127.0.0.1:17800',
        label: 'homelab',
        tunnel: {
          auth_method: 'key',
          credential_id: 'profile:homelab',
          host: '10.0.0.102',
          user: 'alice',
          remote_port: 17_800,
          key_path: '',
          profile: 'homelab',
        },
      }),
    );
    expect(mocks.deployClio).toHaveBeenCalledWith({
      target: 'ssh',
      ssh_profile: 'homelab',
      ssh_host: '10.0.0.102',
      ssh_user: 'alice',
      ssh_auth_method: 'key',
      ssh_credential_id: 'profile:homelab',
    });
  });

  it('uses an advanced remote install location when requested', async () => {
    const user = userEvent.setup();
    renderDialog();
    mocks.deployClio.mockResolvedValue({
      target: 'homelab',
      remote_port: 17_800,
      status: 'installed',
    });

    await user.click(screen.getByRole('button', { name: `Deploy ${vocab.agent}` }));
    await user.click(screen.getByRole('radio', { name: /Remote host/u }));
    await user.click(await screen.findByRole('combobox', { name: 'Saved SSH host' }));
    await user.click(screen.getByRole('option', { name: /homelab/u }));
    await user.click(screen.getByText('Advanced installation'));
    await user.type(screen.getByLabelText('Install location'), '/mnt/common/alice/clio');
    await user.click(screen.getByRole('button', { name: 'Deploy and connect' }));

    await waitFor(() => expect(mocks.deployClio).toHaveBeenCalledOnce());
    expect(mocks.deployClio).toHaveBeenCalledWith({
      target: 'ssh',
      ssh_profile: 'homelab',
      ssh_host: '10.0.0.102',
      ssh_user: 'alice',
      ssh_auth_method: 'key',
      ssh_credential_id: 'profile:homelab',
      install_root: '/mnt/common/alice/clio',
    });
  });

  it('shows string errors returned by the desktop backend', async () => {
    const user = userEvent.setup();
    renderDialog();
    mocks.deployClio.mockRejectedValue('Python 3.12 is required on the remote host.');

    await user.click(screen.getByRole('button', { name: `Deploy ${vocab.agent}` }));
    await user.click(screen.getByRole('radio', { name: /Remote host/u }));
    await user.click(await screen.findByRole('combobox', { name: 'Saved SSH host' }));
    await user.click(screen.getByRole('option', { name: /homelab/u }));
    await user.click(screen.getByRole('button', { name: 'Deploy and connect' }));

    expect(await screen.findByText('Python 3.12 is required on the remote host.')).toBeVisible();
  });
});
