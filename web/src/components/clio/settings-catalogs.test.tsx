import { cleanup, render, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { afterEach, beforeEach, expect, it, vi } from 'vitest';
import { toast } from 'sonner';
import { BlueprintSettings } from './settings-catalogs';

const state = vi.hoisted(() => ({
  settings: { endpoint: 'http://clio.test', token: 'first', label: 'Delta' },
  repository: {
    hostStorageSettings: vi.fn(),
    agentBlueprints: vi.fn(),
    agentBlueprintSources: vi.fn(),
    blueprintOperations: vi.fn(),
    workspaces: vi.fn(),
    configureAgentBlueprintSource: vi.fn(),
    refreshAgentBlueprintSource: vi.fn(),
    updateAgentBlueprint: vi.fn(),
    deleteAgentBlueprint: vi.fn(),
    deleteAgentBlueprintSource: vi.fn(),
    addAgentBlueprintSource: vi.fn(),
    installAgentBlueprint: vi.fn(),
  },
}));
vi.mock('@/hooks/use-repository', () => ({ useRepository: () => state.repository }));
vi.mock('@/providers/connection-provider', () => ({
  useConnectionSettings: () => ({ settings: state.settings }),
}));
vi.mock('./host-path-picker', () => ({ HostPathPicker: () => null }));
vi.mock('./blueprint-details-dialog', () => ({ BlueprintDetailsDialog: () => null }));
vi.mock('sonner', () => ({ toast: { error: vi.fn(), success: vi.fn(), warning: vi.fn() } }));
const source = {
  id: 'src_a',
  name: 'Lab',
  source: '/lab',
  status: 'ready',
  source_kind: 'path',
  install_scope: 'global',
  ref: '',
  pinned_commit: '',
  available_blueprints: [],
  updated_at: 'revision-1',
};
beforeEach(() => {
  vi.resetAllMocks();
  state.settings = { endpoint: 'http://clio.test', token: 'first', label: 'Delta' };
  state.repository.agentBlueprints.mockResolvedValue([]);
  state.repository.hostStorageSettings.mockResolvedValue({
    host_label: 'Delta',
    hostname: 'delta-node',
  });
  state.repository.agentBlueprintSources.mockResolvedValue([source]);
  state.repository.blueprintOperations.mockResolvedValue([]);
  state.repository.workspaces.mockResolvedValue([
    { id: 'ws_a', display_name: 'Experiment', path: '/experiment' },
  ]);
  state.repository.configureAgentBlueprintSource.mockResolvedValue({ ...source, name: 'Renamed' });
});
afterEach(cleanup);
function view(client: QueryClient) {
  return (
    <QueryClientProvider client={client}>
      <BlueprintSettings />
    </QueryClientProvider>
  );
}
function client() {
  return new QueryClient({
    defaultOptions: { queries: { retry: false }, mutations: { retry: false } },
  });
}

it('saves configuration with its revision and does not invoke Reload', async () => {
  const user = userEvent.setup();
  render(view(client()));
  await user.click(await screen.findByRole('tab', { name: 'Marketplaces' }));
  await user.click(await screen.findByRole('button', { name: 'Configure Lab' }));
  await user.clear(screen.getByRole('textbox', { name: 'Name (optional)' }));
  await user.type(screen.getByRole('textbox', { name: 'Name (optional)' }), 'Renamed');
  await user.click(screen.getByRole('button', { name: 'Save configuration' }));
  await waitFor(() =>
    expect(state.repository.configureAgentBlueprintSource).toHaveBeenCalledWith('src_a', {
      name: 'Renamed',
      source: '/lab',
      ref: '',
      pinned_commit: '',
      working_checkout: '',
      expected_updated_at: 'revision-1',
    }),
  );
  expect(state.repository.refreshAgentBlueprintSource).not.toHaveBeenCalled();
});

it('drops an open editor and cached inventory when the authenticated connection changes', async () => {
  const user = userEvent.setup();
  const cache = client();
  const rendered = render(view(cache));
  await user.click(await screen.findByRole('tab', { name: 'Marketplaces' }));
  await user.click(await screen.findByRole('button', { name: 'Configure Lab' }));
  state.repository.agentBlueprintSources.mockResolvedValue([{ ...source, name: 'Second account' }]);
  state.settings = { ...state.settings, token: 'second' };
  rendered.rerender(view(cache));
  expect(screen.queryByRole('dialog')).not.toBeInTheDocument();
  await user.click(await screen.findByRole('tab', { name: 'Marketplaces' }));
  await screen.findByRole('button', { name: 'Configure Second account' });
  expect(screen.queryByRole('button', { name: 'Configure Lab' })).not.toBeInTheDocument();
});

it('reloads the qualified blueprint within its selected workspace', async () => {
  const user = userEvent.setup();
  state.repository.agentBlueprints.mockImplementation(async (workspace?: string) =>
    workspace
      ? [
          {
            id: 'demo',
            blueprint_id: 'demo',
            identity: 'workspace::src_a::demo',
            source_id: 'src_a',
            display_name: 'Workspace agent',
            scope: 'workspace',
            enabled: true,
            metadata: {},
            validation_errors: [],
          },
        ]
      : [],
  );
  state.repository.updateAgentBlueprint.mockResolvedValue({});
  render(view(client()));
  await user.click(screen.getByRole('combobox', { name: 'Workspace access' }));
  await user.click(await screen.findByRole('option', { name: 'Workspace: Experiment' }));
  await user.click(await screen.findByRole('button', { name: 'Actions for Workspace agent' }));
  await user.click(screen.getByRole('menuitem', { name: 'Reload installed copy' }));
  await waitFor(() =>
    expect(state.repository.updateAgentBlueprint).toHaveBeenCalledWith('workspace::src_a::demo', {
      scope: 'workspace',
      workspace_id: 'ws_a',
    }),
  );
});

it('shows a saved failed registration and clears the error for a fresh add', async () => {
  const user = userEvent.setup();
  state.repository.agentBlueprintSources.mockResolvedValue([]);
  state.repository.addAgentBlueprintSource.mockImplementation(async () => {
    state.repository.agentBlueprintSources.mockResolvedValue([
      { ...source, name: 'Broken source', status: 'error', error: 'Repository not found' },
    ]);
    throw new Error('Repository not found');
  });
  render(view(client()));
  await user.click(await screen.findByRole('tab', { name: 'Marketplaces' }));
  await user.click(screen.getByRole('button', { name: 'Add marketplace' }));
  await user.type(
    screen.getByRole('textbox', { name: 'Repository URL' }),
    'https://github.com/example/missing',
  );
  await user.click(
    within(screen.getByRole('dialog')).getByRole('button', { name: 'Add marketplace' }),
  );
  await waitFor(() =>
    expect(within(screen.getByRole('dialog')).getByRole('alert')).toHaveTextContent(
      'repository could not be opened',
    ),
  );
  await user.click(screen.getByRole('button', { name: 'Cancel' }));
  expect(screen.getByRole('heading', { name: 'Broken source' })).toBeVisible();
  await user.click(screen.getByRole('button', { name: 'Add marketplace' }));
  expect(within(screen.getByRole('dialog')).queryByRole('alert')).not.toBeInTheDocument();
});

it('reconciles source status after a failed reload', async () => {
  const user = userEvent.setup();
  state.repository.refreshAgentBlueprintSource.mockImplementation(async () => {
    state.repository.agentBlueprintSources.mockResolvedValue([
      { ...source, status: 'error', error: 'Required service is unavailable' },
    ]);
    throw new Error('Required service is unavailable');
  });
  render(view(client()));
  await user.click(await screen.findByRole('tab', { name: 'Marketplaces' }));
  await user.click(await screen.findByRole('button', { name: 'Reload' }));
  await screen.findByText('Needs attention');
  expect(screen.getByRole('alert')).toHaveTextContent('Required service is unavailable');
  expect(screen.getByRole('button', { name: 'Reload' })).toBeEnabled();
});

it('filters marketplaces and uses the selected workspace for a new marketplace', async () => {
  const user = userEvent.setup();
  render(view(client()));
  await user.click(await screen.findByRole('tab', { name: 'Marketplaces' }));
  await user.type(screen.getByRole('textbox', { name: 'Search marketplaces' }), 'unmatched');
  expect(screen.getByText('No marketplaces match your search')).toBeVisible();
  await user.clear(screen.getByRole('textbox', { name: 'Search marketplaces' }));
  expect(screen.getByRole('heading', { name: 'Lab' })).toBeVisible();
  await user.click(screen.getByRole('combobox', { name: 'Workspace access' }));
  await user.click(screen.getByRole('option', { name: 'Workspace: Experiment' }));
  await user.click(screen.getByRole('button', { name: 'Add marketplace' }));
  expect(screen.getByRole('combobox', { name: 'Available in' })).toHaveTextContent('Experiment');
});

it('keeps install diagnostics available without dumping them into the toast', async () => {
  const user = userEvent.setup();
  const diagnostic =
    'Blueprint "Research" (research): Staged blueprint runtime is invalid: main: unknown tool reference: relay_observe';
  state.repository.agentBlueprintSources.mockResolvedValue([
    {
      ...source,
      available_blueprints: [
        {
          id: 'research',
          title: 'Research',
          kind: 'blueprint',
          enabled: true,
          validation_errors: [],
        },
      ],
    },
  ]);
  state.repository.installAgentBlueprint.mockRejectedValue(new Error(diagnostic));
  render(view(client()));
  await user.click(await screen.findByRole('tab', { name: 'Marketplaces' }));
  await user.click(await screen.findByRole('button', { name: 'Browse blueprints (1)' }));
  await user.click(screen.getByRole('button', { name: 'Install' }));
  await waitFor(() =>
    expect(toast.error).toHaveBeenCalledWith(expect.stringContaining('Research needs tools')),
  );
  expect(toast.error).not.toHaveBeenCalledWith(diagnostic);
  expect(screen.getByText(diagnostic)).not.toBeVisible();
  await user.click(screen.getByText('Error details'));
  expect(screen.getByText(diagnostic)).toBeVisible();
});
