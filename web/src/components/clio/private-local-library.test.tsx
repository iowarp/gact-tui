import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { cleanup, render, screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, beforeEach, expect, it, vi } from 'vitest';
import { MemoryRouter } from 'react-router-dom';
import { TooltipProvider } from '@/components/ui/tooltip';
import { agentEntrySchema, pluginEntrySchema } from '@clio/core/v3';
import { queryKeys } from '@/lib/query-keys';

const repository = vi.hoisted(() => ({
  capabilities: vi.fn(),
  agents: vi.fn(),
  plugins: vi.fn(),
  localLibrary: vi.fn(),
}));
vi.mock('@/hooks/use-repository', () => ({ useRepository: () => repository }));
vi.mock('@/providers/connection-provider', () => ({
  useConnectionSettings: () => ({ settings: { endpoint: 'http://localhost:8787' } }),
}));
vi.mock('./file-text-view', () => ({
  FileTextView: ({ content }: { content: string }) => <pre>{content}</pre>,
}));
import { PrivateLocalLibrary } from './private-local-library';

const definition = {
  id: 'dememory-clio',
  name: 'Dememory Clio',
  description: 'My local scientist',
  extends: 'clio/factorio',
  add: [],
  remove: ['memory'],
};
beforeEach(() => {
  repository.capabilities.mockResolvedValue({ capabilities: { x_clio_agent_plugins: true } });
  repository.plugins.mockResolvedValue({ plugins: [] });
  repository.agents.mockResolvedValue([
    agentEntrySchema.parse({
      ref: 'user/dememory-clio',
      ...definition,
      kind: 'user',
      delta: { add: [], remove: ['memory'] },
    }),
  ]);
  repository.localLibrary.mockResolvedValue({
    root: 'D:/clio/plugins',
    agents_directory: 'D:/clio/plugins/user-agents',
    plugins_directory: 'D:/clio/plugins/local/private-local/plugins',
    agents: [
      {
        ref: 'user/dememory-clio',
        path: 'D:/clio/plugins/user-agents/dememory-clio.json',
        definition,
      },
    ],
  });
});
afterEach(() => {
  cleanup();
  vi.clearAllMocks();
});
function view(onBackup = vi.fn()) {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  render(
    <QueryClientProvider client={client}>
      <MemoryRouter>
        <TooltipProvider>
          <PrivateLocalLibrary onBackup={onBackup} />
        </TooltipProvider>
      </MemoryRouter>
    </QueryClientProvider>,
  );
  return client;
}
it('keeps the browse view about saved items, with storage and source requested separately', async () => {
  view();
  expect(await screen.findByText('Dememory Clio')).toBeVisible();
  expect(screen.queryByText('D:/clio/plugins/user-agents')).toBeNull();
  expect(repository.localLibrary).not.toHaveBeenCalled();
  expect(screen.queryByText(/No local skills/)).toBeNull();
  expect(screen.queryByText(/"remove":/)).toBeNull();
  expect(screen.getByRole('button', { name: 'Back up with GitHub' })).toBeVisible();
  const user = userEvent.setup();
  await user.click(screen.getByRole('button', { name: 'Dememory Clio Agent' }));
  expect(screen.getByText(/Starts from/)).toHaveTextContent('removes memory');
  await user.click(screen.getByRole('button', { name: 'View saved file' }));
  const file = await screen.findByRole('dialog', { name: 'Dememory Clio: saved file' });
  expect(await within(file).findByText(/"remove":/)).toHaveTextContent('"memory"');
  expect(within(file).getByText('D:/clio/plugins/user-agents/dememory-clio.json')).toBeVisible();
  await user.click(within(file).getByRole('button', { name: 'Close' }));
  await user.click(screen.getByRole('button', { name: 'Marketplace details' }));
  const details = await screen.findByRole('dialog', { name: 'Local marketplace details' });
  expect(await within(details).findByText('D:/clio/plugins/user-agents')).toBeVisible();
  await user.click(within(details).getByRole('button', { name: 'Copy agents folder' }));
  expect(await navigator.clipboard.readText()).toBe('D:/clio/plugins/user-agents');
  expect(within(details).queryByText('Dememory Clio')).toBeNull();
});
it('keeps saved agents visible when an older host cannot report source locations', async () => {
  repository.localLibrary.mockRejectedValue(new Error('Route unavailable'));
  view();
  expect(await screen.findByText('Dememory Clio')).toBeVisible();
  expect(screen.queryByRole('alert')).toBeNull();
  await userEvent.setup().click(screen.getByRole('button', { name: 'Marketplace details' }));
  expect(await screen.findByRole('alert')).toHaveTextContent(
    'Storage details aren’t available from this host.',
  );
});

it('refreshes saved definitions through the existing agent mutation invalidation', async () => {
  const client = view();
  await screen.findByText('Dememory Clio');
  const user = userEvent.setup();
  await user.click(screen.getByRole('button', { name: 'Dememory Clio Agent' }));
  await user.click(screen.getByRole('button', { name: 'View saved file' }));
  expect(await screen.findByText(/"remove":/)).toHaveTextContent('"memory"');
  repository.localLibrary.mockResolvedValue({
    root: 'D:/clio/plugins',
    agents_directory: 'D:/clio/plugins/user-agents',
    plugins_directory: 'D:/clio/plugins/local/private-local/plugins',
    agents: [
      {
        ref: 'user/dememory-clio',
        path: 'D:/clio/plugins/user-agents/dememory-clio.json',
        definition: { ...definition, remove: ['web'] },
      },
    ],
  });
  await client.invalidateQueries({ queryKey: queryKeys.key('agents', 'http://localhost:8787') });
  expect(await screen.findByText(/"web"/)).toHaveTextContent('"remove":');
});

it('shows one empty state instead of competing empty categories', async () => {
  repository.agents.mockResolvedValue([]);
  view();
  expect(await screen.findByText('Nothing saved here yet.')).toBeVisible();
  expect(screen.queryByText(/Save a variation/)).toBeNull();
  expect(screen.queryByText(/No local skills/)).toBeNull();
});

it('keeps GitHub backup visible for a collection containing only an agent', async () => {
  const onBackup = vi.fn();
  view(onBackup);
  await screen.findByText('Dememory Clio');
  await userEvent.setup().click(screen.getByRole('button', { name: 'Back up with GitHub' }));
  expect(onBackup).toHaveBeenCalledOnce();
  expect(repository.localLibrary).not.toHaveBeenCalled();
});

it('offers GitHub backup directly for local plugins as well', async () => {
  const onBackup = vi.fn();
  repository.plugins.mockResolvedValue({
    plugins: [
      pluginEntrySchema.parse({
        id: 'local-skill',
        ref: 'private-local/local-skill',
        marketplace: 'private-local',
        version: '1.0.0',
      }),
    ],
  });
  view(onBackup);
  expect(await screen.findByText('local-skill')).toBeVisible();
  expect(screen.queryByText('Installed plugins')).toBeNull();
  expect(screen.getByRole('button', { name: 'Back up with GitHub' })).toBeVisible();
  const user = userEvent.setup();
  await user.click(screen.getByRole('button', { name: 'Back up with GitHub' }));
  expect(onBackup).toHaveBeenCalledOnce();
  expect(screen.queryByRole('dialog')).toBeNull();
});
