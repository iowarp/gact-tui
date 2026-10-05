import 'ace-builds/src-noconflict/ace';
import { cleanup, render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { afterEach, beforeEach, expect, it, vi } from 'vitest';
import { BlueprintFileEditor } from './blueprint-file-editor';

const state = vi.hoisted(() => ({
  settings: { endpoint: 'http://clio.test', token: 'first' },
  repository: {
    readAgentBlueprintDraft: vi.fn(),
    agentBlueprintAuthoring: vi.fn(),
    blueprintOperations: vi.fn(),
    writeAgentBlueprintFile: vi.fn(),
  },
}));
vi.mock('@/hooks/use-repository', () => ({ useRepository: () => state.repository }));
vi.mock('@/providers/connection-provider', () => ({
  useConnectionSettings: () => ({ settings: state.settings }),
}));
vi.mock('next-themes', () => ({ useTheme: () => ({ resolvedTheme: 'light' }) }));
vi.mock('react-ace', () => ({
  default: ({ value, onChange }: { value: string; onChange: (value: string) => void }) => (
    <textarea
      aria-label="Source editor"
      value={value}
      onChange={(event) => onChange(event.target.value)}
    />
  ),
}));
beforeEach(() => {
  vi.clearAllMocks();
  state.settings = { endpoint: 'http://clio.test', token: 'first' };
  state.repository.readAgentBlueprintDraft.mockResolvedValue({
    content: 'Original',
    content_hash: 'one',
  });
  state.repository.agentBlueprintAuthoring.mockResolvedValue({
    source: '/checkout',
    reload_source: '/marketplace',
    separate_checkout: true,
    scope: 'global',
    installed_revision: 'abc123',
    unpublished_files: [],
    reload_required: true,
  });
  state.repository.blueprintOperations.mockResolvedValue([]);
});
afterEach(cleanup);
function view(client: QueryClient) {
  return (
    <QueryClientProvider client={client}>
      <BlueprintFileEditor
        blueprintId="global::src_a::demo"
        workspaceId="ws_a"
        sessionId="sess_a"
        path="AGENT.md"
      />
    </QueryClientProvider>
  );
}
function cache() {
  return new QueryClient({
    defaultOptions: { queries: { retry: false }, mutations: { retry: false } },
  });
}

it('retains unsaved work after navigation and isolates it across authenticated users', async () => {
  const client = cache();
  const user = userEvent.setup();
  const mounted = render(view(client));
  await user.type(await screen.findByRole('textbox', { name: 'Source editor' }), ' private edit');
  mounted.unmount();
  const returned = render(view(client));
  expect(await screen.findByDisplayValue('Original private edit')).toBeInTheDocument();
  state.settings = { ...state.settings, token: 'second' };
  state.repository.readAgentBlueprintDraft.mockResolvedValue({
    content: 'Second account',
    content_hash: 'two',
  });
  returned.rerender(view(client));
  expect(await screen.findByDisplayValue('Second account')).toBeInTheDocument();
  expect(screen.queryByDisplayValue('Original private edit')).not.toBeInTheDocument();
});

it('explains a separate checkout and preserves unsaved work when another editor saves', async () => {
  const client = cache();
  const user = userEvent.setup();
  render(view(client));
  await user.type(await screen.findByRole('textbox', { name: 'Source editor' }), ' mine');
  await user.click(screen.getByRole('button', { name: 'About blueprint authoring' }));
  expect(await screen.findByRole('tooltip')).toHaveTextContent('/marketplace');
  state.repository.readAgentBlueprintDraft.mockResolvedValue({
    content: 'Someone else',
    content_hash: 'other',
  });
  await client.invalidateQueries({ queryKey: ['blueprint-file'] });
  await waitFor(() =>
    expect(screen.getByRole('alert')).toHaveTextContent('Your edits are retained'),
  );
  expect(screen.getByDisplayValue('Original mine')).toBeInTheDocument();
  expect(screen.getByRole('button', { name: 'Save draft' })).toBeDisabled();
});

it('disables duplicate Reload after returning to an active server operation', async () => {
  state.repository.blueprintOperations.mockResolvedValue([
    {
      id: 'op1',
      label: 'Reload marketplace',
      status: 'preparing',
      installed: [],
      skipped: [],
      target: { source_id: 'src_a', scope: 'global' },
    },
  ]);
  render(view(cache()));
  expect(await screen.findByRole('button', { name: 'Reloading' })).toBeDisabled();
});
