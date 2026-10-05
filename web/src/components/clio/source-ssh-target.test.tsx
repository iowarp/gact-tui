vi.mock('@/lib/transport/tauri-runtime', () => ({ inTauri: () => true }));
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { cleanup, render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, beforeEach, expect, it, vi } from 'vitest';
const fixture = vi.hoisted(() => ({
  repository: {
    infrastructureTargets: vi.fn(),
    hostStorageSettings: vi.fn(),
    setInfrastructureTransportState: vi.fn(),
    createInfrastructureTarget: vi.fn(),
    updateInfrastructureTarget: vi.fn(),
  },
  profiles: {
    listSshProfiles: vi.fn(),
    listAllSshProfiles: vi.fn(),
    saveSshProfile: vi.fn(),
    setSshProfileRoute: vi.fn(),
  },
  attachInfrastructureSshTransport: vi.fn(),
  sshTransportStatus: vi.fn(),
  writeSshTransport: vi.fn(),
  openSshConnectionTest: vi.fn(),
  closeSshConnectionTest: vi.fn(),
}));
vi.mock('@/hooks/use-repository', () => ({ useRepository: () => fixture.repository }));
vi.mock('@/providers/connection-provider', () => ({
  useConnectionSettings: () => ({
    settings: { endpoint: 'http://clio.test', token: 'bound-token' },
  }),
}));
vi.mock('@/tauri/ssh-infrastructure-transport', () => fixture);
vi.mock('@/tauri/ssh-profiles', () => fixture.profiles);
import { SourceSshTarget } from './source-ssh-target';
const target = {
  id: 'target-delta',
  label: 'Delta node',
  kind: 'ssh',
  transport_state: 'connected',
  install_root: '',
  ssh: {
    profile: 'delta',
    host: 'delta.example',
    user: 'alice',
    port: 22,
    jump_hosts: [],
    identity_file: '',
    platform: 'auto',
  },
};
const connected = {
  session_id: 'existing-desktop-session',
  state: 'connected',
  reused: true,
  output: '',
};
beforeEach(() => {
  vi.resetAllMocks();
  fixture.repository.infrastructureTargets.mockResolvedValue([target]);
  fixture.repository.updateInfrastructureTarget.mockResolvedValue(target);
  fixture.repository.createInfrastructureTarget.mockResolvedValue(target);
  fixture.repository.hostStorageSettings.mockResolvedValue({ effective: { root: '/data/clio' } });
  fixture.profiles.listSshProfiles.mockResolvedValue([
    { name: 'delta', label: 'Delta node', hostname: 'delta.example', user: 'alice', port: 22 },
  ]);
  fixture.profiles.listAllSshProfiles.mockResolvedValue([]);
  fixture.profiles.saveSshProfile.mockImplementation(async (input) => ({
    ...input,
    managed: true,
  }));
  fixture.attachInfrastructureSshTransport.mockResolvedValue(connected);
  fixture.sshTransportStatus.mockResolvedValue(connected);
});
afterEach(cleanup);
function setup(outerForm = false) {
  const onChange = vi.fn();
  const outerSubmit = vi.fn((event) => event.preventDefault());
  const content = <SourceSshTarget onChange={onChange} />;
  render(
    <QueryClientProvider
      client={new QueryClient({ defaultOptions: { queries: { retry: false } } })}
    >
      {outerForm ? <form onSubmit={outerSubmit}>{content}</form> : content}
    </QueryClientProvider>,
  );
  return { onChange, outerSubmit };
}
async function chooseHost() {
  const user = userEvent.setup();
  await user.click(await screen.findByRole('combobox', { name: 'Saved SSH host' }));
  await user.click(await screen.findByRole('option', { name: 'Delta node' }));
  return user;
}
it('uses the complete Desktop editor without submitting the enclosing source form', async () => {
  const { outerSubmit } = setup(true);
  const user = userEvent.setup();
  await user.click(screen.getByRole('button', { name: 'Add SSH host' }));
  expect(screen.getByLabelText('Paste a private key')).toBeVisible();
  expect(screen.getByRole('button', { name: 'Choose key file' })).toBeVisible();
  expect(screen.getByRole('button', { name: 'Test connection' })).toBeVisible();
  await user.type(screen.getByLabelText('Address'), 'storage.example.edu');
  await user.click(screen.getByRole('button', { name: 'Save host' }));
  await waitFor(() => expect(fixture.profiles.saveSshProfile).toHaveBeenCalled());
  expect(outerSubmit).not.toHaveBeenCalled();
  expect(screen.getByRole('button', { name: 'Connect host' })).toBeEnabled();
});
it('reuses the saved host and Desktop transport even when durable state says connected', async () => {
  const { onChange } = setup();
  const user = await chooseHost();
  await user.click(screen.getByRole('button', { name: 'Connect host' }));
  await waitFor(() => expect(onChange).toHaveBeenLastCalledWith(target, '/data/clio'));
  expect(fixture.repository.createInfrastructureTarget).not.toHaveBeenCalled();
  expect(fixture.attachInfrastructureSshTransport).toHaveBeenCalledWith(
    'http://clio.test',
    'bound-token',
    target,
  );
  expect(fixture.repository.setInfrastructureTransportState).toHaveBeenCalledWith(
    target.id,
    'connected',
  );
});
it('requires the real Desktop bridge before enabling folder browsing', async () => {
  fixture.attachInfrastructureSshTransport
    .mockResolvedValueOnce(connected)
    .mockRejectedValueOnce(new Error('Bridge admission failed'));
  const { onChange } = setup();
  const user = await chooseHost();
  await user.click(screen.getByRole('button', { name: 'Connect host' }));
  expect(await screen.findByRole('alert')).toHaveTextContent('Bridge admission failed');
  expect(onChange).not.toHaveBeenCalledWith(target, expect.anything());
  expect(fixture.repository.hostStorageSettings).not.toHaveBeenCalled();
  expect(fixture.repository.setInfrastructureTransportState).not.toHaveBeenCalled();
});
it('uses the existing private authentication prompt before allowing folder browsing', async () => {
  const pending = {
    ...connected,
    state: 'reauthentication_required',
    prompt: { kind: 'password', text: 'Password:', context: 'Password:' },
  };
  fixture.attachInfrastructureSshTransport
    .mockResolvedValueOnce(pending)
    .mockResolvedValue(connected);
  fixture.sshTransportStatus.mockResolvedValue(pending);
  fixture.writeSshTransport.mockImplementation(async () => {
    fixture.sshTransportStatus.mockResolvedValue(connected);
  });
  const { onChange } = setup();
  const user = await chooseHost();
  await user.click(screen.getByRole('button', { name: 'Connect host' }));
  await user.type(await screen.findByLabelText('Password:'), 'test-password');
  expect(fixture.repository.hostStorageSettings).not.toHaveBeenCalled();
  await user.click(screen.getByRole('button', { name: 'Continue' }));
  await waitFor(() => expect(onChange).toHaveBeenLastCalledWith(target, '/data/clio'));
  expect(fixture.writeSshTransport).toHaveBeenCalledWith(
    'existing-desktop-session',
    'test-password\n',
  );
  expect(JSON.stringify(fixture.repository.updateInfrastructureTarget.mock.calls)).not.toContain(
    'test-password',
  );
});
it('retains Desktop hop editing and disables connection for an incomplete route', async () => {
  setup();
  const user = await chooseHost();
  await user.click(screen.getByRole('button', { name: 'Add hop' }));
  expect(screen.getByRole('button', { name: 'Connect host' })).toBeDisabled();
  await user.click(screen.getByRole('button', { name: 'Manage SSH hosts' }));
  expect(await screen.findByRole('dialog', { name: 'Manage SSH hosts' })).toBeVisible();
  expect(fixture.profiles.listAllSshProfiles).toHaveBeenCalled();
});
