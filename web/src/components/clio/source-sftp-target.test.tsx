import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { act, cleanup, render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, beforeEach, expect, it, vi } from 'vitest';
const fixture = vi.hoisted(() => ({
  repository: {
    infrastructureTargets: vi.fn(),
    inspectSourceSsh: vi.fn(),
    createInfrastructureTarget: vi.fn(),
    updateInfrastructureTarget: vi.fn(),
  },
  nativeTest: vi.fn(),
  nativeSave: vi.fn(),
}));
vi.mock('@/lib/transport/tauri-runtime', () => ({ inTauri: () => false }));
vi.mock('@/hooks/use-repository', () => ({ useRepository: () => fixture.repository }));
vi.mock('@/providers/connection-provider', () => ({
  useConnectionSettings: () => ({ settings: { endpoint: 'http://clio.test' } }),
}));
vi.mock('@/tauri/ssh-infrastructure-transport', () => ({
  openSshConnectionTest: fixture.nativeTest,
}));
vi.mock('@/tauri/ssh-profiles', () => ({ saveSshProfile: fixture.nativeSave }));
import { SourceSshTarget } from './source-ssh-target';
const target = {
  id: 'my-storage',
  label: 'My storage',
  kind: 'ssh',
  ssh: { host: 'storage.example.edu', user: 'alice', port: 22 },
};
beforeEach(() => {
  vi.resetAllMocks();
  fixture.repository.infrastructureTargets.mockResolvedValue([]);
  fixture.repository.inspectSourceSsh.mockResolvedValue({
    path: '/data',
    parent: '/',
    entries: [],
    truncated: false,
  });
  fixture.repository.createInfrastructureTarget.mockResolvedValue(target);
  fixture.nativeTest.mockRejectedValue(new Error('Interactive SSH testing requires CLIO Desktop'));
});
afterEach(() => {
  cleanup();
  vi.restoreAllMocks();
});
async function editor() {
  const onChange = vi.fn();
  render(
    <QueryClientProvider
      client={new QueryClient({ defaultOptions: { queries: { retry: false } } })}
    >
      <SourceSshTarget hostLabel="connected-server" onChange={onChange} />
    </QueryClientProvider>,
  );
  const user = userEvent.setup();
  await user.click(screen.getByRole('button', { name: 'Add connection' }));
  await user.type(screen.getByLabelText('Address'), 'storage.example.edu');
  await user.type(screen.getByLabelText('Username'), 'alice');
  return { user, onChange };
}
it('uses a browser file picker and tests the selected key through SFTP without native calls', async () => {
  const { user, onChange } = await editor();
  const picker = screen.getByLabelText('SSH private key file');
  const clicked = vi.fn();
  picker.addEventListener('click', clicked);
  await user.click(screen.getByRole('button', { name: 'Choose key file' }));
  expect(clicked).toHaveBeenCalledOnce();
  await user.upload(picker, new File(['test-private-key'], 'id_ed25519', { type: 'text/plain' }));
  expect(await screen.findByText('id_ed25519', { exact: true })).toBeVisible();
  await user.type(screen.getByLabelText('Key passphrase (optional)'), 'test-passphrase');
  await user.click(screen.getByRole('button', { name: 'Test connection' }));
  expect(await screen.findByText('Connection succeeded')).toBeVisible();
  expect(fixture.repository.inspectSourceSsh).toHaveBeenLastCalledWith({
    route: expect.objectContaining({ host: 'storage.example.edu', user: 'alice' }),
    credentials: { private_key: 'test-private-key', passphrase: 'test-passphrase' },
  });
  await user.click(screen.getByRole('button', { name: 'Save host' }));
  await waitFor(() =>
    expect(onChange).toHaveBeenLastCalledWith(target, '/data', {
      private_key: 'test-private-key',
      passphrase: 'test-passphrase',
    }),
  );
  expect(JSON.stringify(fixture.repository.createInfrastructureTarget.mock.calls)).not.toContain(
    'test-private-key',
  );
  expect(fixture.nativeTest).not.toHaveBeenCalled();
  expect(fixture.nativeSave).not.toHaveBeenCalled();
});
it('provides direct password login and explains the browser authentication limits', async () => {
  const { user } = await editor();
  await user.click(screen.getByRole('radio', { name: 'Password' }));
  const input = screen.getByLabelText('SSH password');
  expect(input).toHaveAttribute('type', 'password');
  await user.type(input, 'test-password');
  await user.click(screen.getByRole('button', { name: 'Test connection' }));
  expect(await screen.findByText('Connection succeeded')).toBeVisible();
  expect(fixture.repository.inspectSourceSsh).toHaveBeenLastCalledWith(
    expect.objectContaining({ credentials: { password: 'test-password' } }),
  );
  await user.click(screen.getByRole('button', { name: 'About browser SFTP authentication' }));
  expect(
    await screen.findByText(/Interactive Duo\/2FA, security-key prompts and Kerberos require/),
  ).toBeVisible();
  expect(fixture.nativeTest).not.toHaveBeenCalled();
});
it('keeps failed credentials out of host records and leaves the editor available to retry', async () => {
  const { user, onChange } = await editor();
  fixture.repository.inspectSourceSsh.mockRejectedValue(new Error('SSH sign-in failed'));
  await user.click(screen.getByRole('radio', { name: 'Password' }));
  await user.type(screen.getByLabelText('SSH password'), 'wrong-password');
  await user.click(screen.getByRole('button', { name: 'Save host' }));
  expect(await screen.findByText('SSH sign-in failed')).toBeVisible();
  expect(fixture.repository.createInfrastructureTarget).not.toHaveBeenCalled();
  expect(onChange).not.toHaveBeenCalledWith(target, expect.anything(), expect.anything());
});

it('does not restore a pending key selection after switching to password', async () => {
  const read = vi.spyOn(FileReader.prototype, 'readAsText').mockImplementation(() => undefined);
  const { user } = await editor();
  await user.upload(screen.getByLabelText('SSH private key file'), new File(['key'], 'old-key'));
  const pending = read.mock.contexts[0] as FileReader;
  await user.click(screen.getByRole('radio', { name: 'Password' }));
  await user.type(screen.getByLabelText('SSH password'), 'current-password');
  act(() => {
    Object.defineProperty(pending, 'result', { value: 'stale-private-key' });
    pending.dispatchEvent(new ProgressEvent('load'));
  });
  expect(screen.getByRole('radio', { name: 'Password' })).toBeChecked();
  await user.click(screen.getByRole('button', { name: 'Test connection' }));
  expect(await screen.findByText('Connection succeeded')).toBeVisible();
  expect(fixture.repository.inspectSourceSsh).toHaveBeenLastCalledWith(
    expect.objectContaining({ credentials: { password: 'current-password' } }),
  );
});
