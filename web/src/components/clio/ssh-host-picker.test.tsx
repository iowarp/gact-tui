import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { cleanup, render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

const infrastructure = vi.hoisted(() => ({
  preflightTarget: vi.fn(),
  sshProfiles: vi.fn(),
}));
const credentials = vi.hoisted(() => ({
  deleteSshPassword: vi.fn(),
  storeSshIdentity: vi.fn(),
  storeSshPassword: vi.fn(),
}));

vi.mock('@/tauri/infrastructure-setup', () => infrastructure);
vi.mock('@/tauri/ssh-credentials', () => credentials);

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
  infrastructure.sshProfiles.mockResolvedValue([]);
  infrastructure.preflightTarget.mockResolvedValue({ os: 'linux', arch: 'x86_64' });
  credentials.deleteSshPassword.mockResolvedValue(undefined);
  credentials.storeSshIdentity.mockResolvedValue('/protected/id_ed25519');
  credentials.storeSshPassword.mockResolvedValue(undefined);
});

afterEach(() => {
  cleanup();
  vi.clearAllMocks();
});

describe('SshHostPicker', () => {
  it('presents password and key as first-class authentication tabs', async () => {
    const user = userEvent.setup();
    renderPicker();

    await user.click(screen.getByRole('button', { name: 'Add SSH host' }));

    expect(screen.getByRole('tab', { name: 'Password' })).toBeVisible();
    expect(screen.getByRole('tab', { name: 'Key' })).toBeVisible();
    expect(screen.queryByText(/advanced authentication/i)).not.toBeInTheDocument();

    await user.click(screen.getByRole('tab', { name: 'Password' }));
    expect(screen.getByLabelText('Password', { selector: 'input' })).toHaveAttribute(
      'type',
      'password',
    );

    await user.click(screen.getByRole('tab', { name: 'Key' }));
    expect(screen.getByLabelText('Paste a private key')).toBeVisible();
    expect(screen.getByRole('button', { name: 'Choose key file' })).toBeVisible();
  });

  it('stores password authentication in the operating-system vault before saving', async () => {
    const user = userEvent.setup();
    const { onChange } = renderPicker();

    await user.click(screen.getByRole('button', { name: 'Add SSH host' }));
    await user.type(screen.getByLabelText('Address'), '10.0.0.102');
    await user.type(screen.getByLabelText('Username'), 'alice');
    await user.click(screen.getByRole('tab', { name: 'Password' }));
    await user.type(screen.getByLabelText('Password', { selector: 'input' }), 'vault-only-secret');
    await user.click(screen.getByRole('button', { name: 'Save host' }));

    await waitFor(() =>
      expect(credentials.storeSshPassword).toHaveBeenCalledWith(
        'manual:alice@10.0.0.102:22',
        'vault-only-secret',
      ),
    );
    expect(onChange).toHaveBeenCalledWith(
      expect.objectContaining({
        authMethod: 'password',
        credentialId: 'manual:alice@10.0.0.102:22',
        host: '10.0.0.102',
        user: 'alice',
      }),
    );
    expect(localStorage.getItem('clio.saved-ssh-hosts.v1')).not.toContain('vault-only-secret');
  });

  it('saves an optional persistent CLIO install and runtime location with the host', async () => {
    const user = userEvent.setup();
    const { onChange } = renderPicker();

    await user.click(screen.getByRole('button', { name: 'Add SSH host' }));
    await user.type(screen.getByLabelText('Address'), 'ares.example.edu');
    await user.click(screen.getByText('Advanced host settings'));
    await user.type(
      screen.getByLabelText('CLIO install and runtime location'),
      '/mnt/common/alice/clio',
    );
    await user.click(screen.getByRole('button', { name: 'Save host' }));

    expect(onChange).toHaveBeenCalledWith(
      expect.objectContaining({ installRoot: '/mnt/common/alice/clio' }),
    );
    expect(localStorage.getItem('clio.saved-ssh-hosts.v1')).toContain('/mnt/common/alice/clio');
  });
});
