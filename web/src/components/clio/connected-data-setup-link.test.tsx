import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { cleanup, render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { PresentationNavigation } from './presentation-navigation';
import { ConnectedDataSetupLink } from './connected-data-setup-link';

const fixture = vi.hoisted(() => ({ token: 'one', storageProviders: vi.fn() }));
vi.mock('@/providers/connection-provider', () => ({
  useConnectionSettings: () => ({ settings: { endpoint: 'https://clio', token: fixture.token } }),
}));
vi.mock('@/hooks/use-repository', () => ({ useRepository: () => fixture }));
vi.mock('./connected-source-picker', () => ({
  ConnectedSourcePicker: ({ workspaceId }: { workspaceId: string }) => (
    <div role="dialog">Private setup {workspaceId}</div>
  ),
}));

beforeEach(() => {
  fixture.token = 'one';
  vi.resetAllMocks();
  fixture.storageProviders.mockResolvedValue({ clio_id: 'owner' });
});
afterEach(cleanup);
function view(client: QueryClient, workspaceId = 'w') {
  return (
    <QueryClientProvider client={client}>
      <PresentationNavigation.Provider value={{ artifacts: {}, subagents: {}, workspaceId }}>
        <ConnectedDataSetupLink
          block={{
            id: 'setup',
            type: 'link',
            target: 'connected_data',
            uri: 'owner',
            workspace_id: 'w',
          }}
        />
      </PresentationNavigation.Provider>
    </QueryClientProvider>
  );
}
describe('private connected-data setup action', () => {
  it('requires a click, verifies the owning CLIO and closes on credential changes', async () => {
    const client = new QueryClient();
    const rendered = render(view(client));
    expect(fixture.storageProviders).not.toHaveBeenCalled();
    await userEvent.click(screen.getByRole('button', { name: 'Connect data' }));
    expect(await screen.findByRole('dialog')).toHaveTextContent('Private setup w');
    fixture.token = 'two';
    rendered.rerender(view(client));
    expect(screen.queryByRole('dialog')).not.toBeInTheDocument();
    fixture.storageProviders.mockResolvedValue({ clio_id: 'another-owner' });
    await userEvent.click(screen.getByRole('button', { name: 'Connect data' }));
    expect(await screen.findByRole('alert')).toHaveTextContent('different');
    expect(screen.queryByRole('dialog')).not.toBeInTheDocument();
  });
  it('refuses a different workspace and allows an owner-check retry', async () => {
    const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
    const rendered = render(view(client, 'other'));
    expect(screen.getByRole('button', { name: 'Connect data' })).toBeDisabled();
    rendered.rerender(view(client));
    fixture.storageProviders.mockRejectedValueOnce(new Error('offline'));
    await userEvent.click(screen.getByRole('button', { name: 'Connect data' }));
    expect(await screen.findByRole('alert')).toHaveTextContent('Retry Connect data');
    await userEvent.click(screen.getByRole('button', { name: 'Connect data' }));
    await waitFor(() => expect(screen.getByRole('dialog')).toBeInTheDocument());
  });
  it('explains privacy on keyboard focus', async () => {
    render(view(new QueryClient()));
    const user = userEvent.setup();
    await user.tab();
    await user.tab();
    expect(await screen.findByRole('tooltip')).toHaveTextContent('outside the agent conversation');
  });
});
