import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { cleanup, render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, beforeEach, expect, it, vi } from 'vitest';
import { MemoryRouter } from 'react-router-dom';
import { TooltipProvider } from '@/components/ui/tooltip';
import { agentEntrySchema } from '@clio/core/v3';
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
function view() {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  render(
    <QueryClientProvider client={client}>
      <MemoryRouter>
        <TooltipProvider>
          <PrivateLocalLibrary onBackup={vi.fn()} />
        </TooltipProvider>
      </MemoryRouter>
    </QueryClientProvider>,
  );
  return client;
}
it('shows an agent-only collection, its real host folders and saved definition without GitHub', async () => {
  view();
  expect(await screen.findByText('Dememory Clio')).toBeVisible();
  expect(await screen.findByText('D:/clio/plugins/user-agents')).toBeVisible();
  expect(screen.queryByRole('button', { name: /Back up/ })).toBeNull();
  const user = userEvent.setup();
  await user.click(screen.getByText('Saved definition: user/dememory-clio'));
  expect(screen.getByText('D:/clio/plugins/user-agents/dememory-clio.json')).toBeVisible();
  expect(screen.getByText(/"remove":/)).toHaveTextContent('"memory"');
  await user.click(screen.getByRole('button', { name: 'Dememory Clio Yours' }));
  expect(screen.getByText(/Starts from/)).toHaveTextContent('removes memory');
});
it('keeps saved agents visible when an older host cannot report source locations', async () => {
  repository.localLibrary.mockRejectedValue(new Error('Route unavailable'));
  view();
  expect(await screen.findByText('Dememory Clio')).toBeVisible();
  expect(await screen.findByRole('alert')).toHaveTextContent(
    'could not report local source locations',
  );
});

it('refreshes saved definitions through the existing agent mutation invalidation', async () => {
  const client = view();
  await screen.findByText('Dememory Clio');
  repository.localLibrary.mockResolvedValue({
    root: 'D:/clio/plugins',
    agents_directory: 'D:/clio/plugins/user-agents',
    plugins_directory: 'D:/clio/plugins/local/private-local/plugins',
    agents: [
      {
        ref: 'user/new-agent',
        path: 'D:/clio/plugins/user-agents/new-agent.json',
        definition: { ...definition, id: 'new-agent' },
      },
    ],
  });
  await client.invalidateQueries({ queryKey: queryKeys.key('agents', 'http://localhost:8787') });
  expect(await screen.findByText('Saved definition: user/new-agent')).toBeVisible();
});
