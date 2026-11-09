import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { cleanup, render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { MemoryRouter, useLocation } from 'react-router-dom';
import { afterEach, beforeEach, expect, it, vi } from 'vitest';
import { TooltipProvider } from '@/components/ui/tooltip';
import { connectionScope } from '@/lib/connection-scope';

const fixtures = vi.hoisted(() => ({
  endpoint: 'https://clio-one',
  repository: {
    storageProviders: vi.fn(),
    workspaces: vi.fn(),
    createConnectedSource: vi.fn(),
  },
}));
vi.mock('@/hooks/use-repository', () => ({ useRepository: () => fixtures.repository }));
vi.mock('@/providers/connection-provider', () => ({
  useConnectionSettings: () => ({ settings: { endpoint: fixtures.endpoint, token: 'test' } }),
}));
import { DataSourceSettings } from './settings-data-sources';

beforeEach(() => {
  vi.resetAllMocks();
  fixtures.endpoint = 'https://clio-one';
  fixtures.repository.storageProviders.mockResolvedValue({
    providers: [
      { id: 'obsidian', name: 'Obsidian', authentication: 'none', configured: true },
      {
        id: 'google_drive',
        name: 'Google Drive',
        authentication: 'browser',
        configured: true,
        authenticated: true,
      },
      { id: 'globus', name: 'Globus', authentication: 'browser', configured: true },
      { id: 'github', name: 'GitHub', authentication: 'browser', configured: true },
    ],
  });
  fixtures.repository.workspaces.mockResolvedValue([
    { id: 'one', display_name: 'Research' },
    { id: 'two', display_name: 'Teaching' },
  ]);
});
afterEach(cleanup);
function LocationProbe() {
  const location = useLocation();
  return (
    <output data-testid="route">
      {JSON.stringify({ path: location.pathname, state: location.state })}
    </output>
  );
}
function mount() {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  const content = () => (
    <QueryClientProvider client={client}>
      <TooltipProvider>
        <MemoryRouter>
          <DataSourceSettings />
          <LocationProbe />
        </MemoryRouter>
      </TooltipProvider>
    </QueryClientProvider>
  );
  const view = render(content());
  return { user: userEvent.setup(), view, content };
}
const openers = {
  new: (user: ReturnType<typeof userEvent.setup>) =>
    screen.findByRole('button', { name: 'New vault' }).then((button) => user.click(button)),
  existing: async (user: ReturnType<typeof userEvent.setup>) => {
    await user.click(await screen.findByRole('button', { name: 'More actions for Obsidian' }));
    await user.click(await screen.findByRole('menuitem', { name: /^Connect an existing vault/u }));
  },
};
it.each([
  ['New vault', 'new'],
  ['Connect an existing vault', 'existing'],
] as const)('routes %s to the explicitly chosen workspace and setup choice', async (_, choice) => {
  const { user } = mount();
  await openers[choice](user);
  const picker = await screen.findByRole('button', { name: 'Workspace: none chosen' });
  await waitFor(() => expect(picker).toBeEnabled());
  expect(screen.getByRole('button', { name: 'Continue' })).toBeDisabled();
  await user.click(picker);
  await user.click(await screen.findByRole('menuitemradio', { name: 'Teaching' }));
  await user.click(screen.getByRole('button', { name: 'Continue' }));
  expect(JSON.parse(screen.getByTestId('route').textContent!)).toEqual({
    path: '/workspaces/two/new',
    state: {
      sourceConnection: {
        scope: connectionScope({ endpoint: fixtures.endpoint, token: 'test' }),
        providerId: 'obsidian',
        choice,
      },
    },
  });
  expect(fixtures.repository.createConnectedSource).not.toHaveBeenCalled();
});
it('offers Sign in until an account is signed in, then keeps workspace connection in More', async () => {
  const { user } = mount();
  expect(await screen.findByText('Signed in')).toBeInTheDocument();
  expect(screen.queryByRole('button', { name: 'Sign in to Google Drive' })).toBeNull();
  expect(screen.queryByRole('button', { name: /^Connect / })).toBeNull();
  for (const name of ['Globus', 'GitHub']) {
    expect(screen.getByRole('button', { name: `Sign in to ${name}` })).toBeEnabled();
  }
  await user.click(screen.getByRole('button', { name: 'More actions for Google Drive' }));
  expect(await screen.findByRole('menuitem', { name: 'Connect to a workspace…' })).toBeVisible();
});
it('discards the workspace dialog when the connected service changes', async () => {
  const { user, view, content } = mount();
  await user.click(await screen.findByRole('button', { name: 'New vault' }));
  expect(screen.getByRole('dialog')).toBeInTheDocument();
  fixtures.endpoint = 'https://clio-two';
  view.rerender(content());
  expect(screen.queryByRole('dialog')).not.toBeInTheDocument();
});
