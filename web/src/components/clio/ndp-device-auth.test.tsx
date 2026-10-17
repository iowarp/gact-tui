import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { cleanup, render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, expect, it, vi } from 'vitest';
import { NDPDeviceAuth } from './ndp-device-auth';
vi.mock('@/tauri/external-url', () => ({
  prepareExternalUrl: () => ({ open: vi.fn(), cancel: vi.fn() }),
}));
afterEach(cleanup);
const mount = (node: React.ReactNode) =>
  render(<QueryClientProvider client={new QueryClient()}>{node}</QueryClientProvider>);
function repository() {
  return {
    startSourceSignIn: vi.fn().mockResolvedValue({
      flow_id: 'flow',
      user_code: 'ABCD-EFGH',
      authorization_url: 'https://ndp.test/verify?user_code=ABCD-EFGH',
      interval: 0.01,
    }),
    completeSourceSignIn: vi.fn().mockResolvedValue({ authenticated: false }),
    cancelSourceSignIn: vi.fn().mockResolvedValue({ cancelled: true }),
  };
}
it('shows the device code, polls privately and completes without a pasted callback', async () => {
  const repo = repository();
  const onComplete = vi.fn();
  repo.completeSourceSignIn.mockResolvedValue({ authenticated: true });
  mount(<NDPDeviceAuth repository={repo} workspaceId="w" sourceId="s" onComplete={onComplete} />);
  await userEvent.click(screen.getByRole('button', { name: 'Sign in to NDP' }));
  expect(await screen.findByLabelText('NDP sign-in code')).toHaveTextContent('ABCD-EFGH');
  expect(screen.queryByRole('textbox')).not.toBeInTheDocument();
  await waitFor(() => expect(onComplete).toHaveBeenCalledTimes(1));
  expect(repo.completeSourceSignIn).toHaveBeenCalledWith('w', 's', 'flow', '');
});
it('cancels the server-owned flow and stops polling when dismissed', async () => {
  const repo = repository();
  const onComplete = vi.fn();
  const view = mount(
    <NDPDeviceAuth repository={repo} workspaceId="w" sourceId="s" onComplete={onComplete} />,
  );
  await userEvent.click(screen.getByRole('button', { name: 'Sign in to NDP' }));
  await userEvent.click(await screen.findByRole('button', { name: 'Cancel sign-in' }));
  expect(repo.cancelSourceSignIn).toHaveBeenCalledWith('w', 's', 'flow');
  view.unmount();
  expect(onComplete).not.toHaveBeenCalled();
});

it('keeps a pending login across a Settings repository wrapper refresh', async () => {
  const repo = repository();
  repo.startSourceSignIn.mockResolvedValue({
    flow_id: 'flow',
    user_code: 'ABCD-EFGH',
    authorization_url: 'https://ndp.test/verify',
    interval: 60,
  });
  const client = new QueryClient();
  const content = (current: typeof repo) => (
    <QueryClientProvider client={client}>
      <NDPDeviceAuth repository={current} workspaceId="w" sourceId="s" onComplete={vi.fn()} />
    </QueryClientProvider>
  );
  const view = render(content(repo));
  await userEvent.click(screen.getByRole('button', { name: 'Sign in to NDP' }));
  await screen.findByLabelText('NDP sign-in code');
  view.rerender(content({ ...repo }));
  expect(screen.getByLabelText('NDP sign-in code')).toBeVisible();
  expect(repo.cancelSourceSignIn).not.toHaveBeenCalled();
  view.unmount();
  expect(repo.cancelSourceSignIn).toHaveBeenCalledWith('w', 's', 'flow');
});
