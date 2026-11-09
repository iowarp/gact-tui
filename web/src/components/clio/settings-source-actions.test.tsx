import { TooltipProvider } from '@/components/ui/tooltip';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { cleanup, render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { MemoryRouter, useLocation } from 'react-router-dom';
import { afterEach, beforeEach, expect, it, vi } from 'vitest';
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
      { id: 'google_drive', name: 'Google Drive', authentication: 'browser', configured: true },
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
it.each([
  ['New vault', 'new'],
  ['Connect Obsidian', 'existing'],
])('routes %s to the explicitly chosen workspace and setup choice', async (name, choice) => {
  const { user } = mount();
  await user.click(await screen.findByRole('button', { name }));
  await screen.findByRole('option', { name: 'Teaching' });
  expect(screen.getByRole('button', { name: /^Continue/ })).toBeDisabled();
  await user.selectOptions(screen.getByRole('combobox', { name: 'Workspace' }), 'two');
  await user.click(screen.getByRole('button', { name: /^Continue/ }));
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
it('offers Sign in and Connect separately for account providers and knowledge-first info on hover and focus', async () => {
  const { user } = mount();
  for (const name of ['Google Drive', 'Globus', 'GitHub']) {
    expect(await screen.findByRole('button', { name: `Sign in to ${name}` })).toBeEnabled();
    expect(screen.getByRole('button', { name: `Connect ${name}` })).toBeEnabled();
    expect(screen.getByRole('button', { name: `About ${name}` })).toBeInTheDocument();
  }
  const info = screen.getByRole('button', { name: 'About Obsidian' });
  await user.hover(info);
  expect(await screen.findByRole('tooltip')).toHaveTextContent(/^Build a knowledge graph/);
  expect(screen.getByRole('tooltip')).toHaveTextContent('optional paid cross-device Sync');
  await user.unhover(info);
  await user.click(info);
  expect(await screen.findByRole('tooltip')).toHaveTextContent(
    'no Obsidian installation or account is required',
  );
  expect(screen.queryByRole('button', { name: /Manage Obsidian/ })).not.toBeInTheDocument();
});
it('discards the workspace dialog when the connected service changes', async () => {
  const { user, view, content } = mount();
  await user.click(await screen.findByRole('button', { name: 'New vault' }));
  expect(screen.getByRole('dialog')).toBeInTheDocument();
  fixtures.endpoint = 'https://clio-two';
  view.rerender(content());
  expect(screen.queryByRole('dialog')).not.toBeInTheDocument();
});
