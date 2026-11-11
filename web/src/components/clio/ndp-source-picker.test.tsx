import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { act, cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, beforeEach, expect, it, vi } from 'vitest';
import type { SourceProvider } from '@clio/core/v3';
import { NDPSourcePicker } from './ndp-source-picker';

const fixture = vi.hoisted(() => ({
  repository: {
    searchNdp: vi.fn(),
    ndpOrganizations: vi.fn(),
    attachNdp: vi.fn(),
    ndpEndpointConnections: vi.fn(),
    beginSourceDraft: vi.fn(),
    attachSourceFolder: vi.fn(),
  },
}));
vi.mock('@/hooks/use-repository', () => ({ useRepository: () => fixture.repository }));
vi.mock('@/providers/connection-provider', () => ({
  useConnectionSettings: () => ({ settings: { endpoint: 'https://clio.test', token: '' } }),
}));
const provider: SourceProvider = {
  id: 'ndp',
  name: 'National Data Platform',
  logo: 'ndp',
  authentication: 'browser',
  configured: true,
  authenticated: true,
  setup_requirement: null,
  capabilities: { supported_modes: ['read_only'], unavailable_reasons: {} },
};
const dataset = {
  id: 'sea',
  name: 'ndp_coastal_observations_2026_v2',
  title: 'Sea observations',
  description: 'Measured waves',
  endpoint_id: 'ocean',
  endpoint_name: 'Océan Endpoint',
  access: null,
  resources: [
    {
      id: 'stations',
      path: 'stations.csv',
      name: 'stations.csv',
      format: 'CSV',
      size: 1024,
      revision: 'r1',
    },
  ],
};
const second = {
  ...dataset,
  id: 'weather',
  name: 'weather',
  title: 'Weather records',
  description: 'Air temperatures',
  resources: [{ ...dataset.resources[0], id: 'air', name: 'temperatures.nc', format: 'NetCDF' }],
};
beforeEach(() => {
  vi.resetAllMocks();
  fixture.repository.ndpEndpointConnections.mockResolvedValue({ endpoints: [] });
  fixture.repository.searchNdp.mockResolvedValue({ datasets: [dataset], warnings: [] });
  fixture.repository.ndpOrganizations.mockResolvedValue({
    organizations: [
      { id: 'earthscope_consortium', endpoint_id: 'ocean', endpoint_name: 'Océan Endpoint' },
      { id: 'weather', endpoint_id: 'climate', endpoint_name: 'Climate' },
    ],
  });
  fixture.repository.attachNdp.mockImplementation(async (_workspace, input) => ({
    id: input.dataset_id,
    label: input.dataset_id,
  }));
});
it('filters publishers by name and searches only the selected organization and endpoint', async () => {
  show();
  const user = userEvent.setup();
  await screen.findByRole('button', { name: /Sea observations/ });
  await user.click(screen.getByRole('combobox', { name: 'Organization filter' }));
  await user.type(screen.getByPlaceholderText('Find an organization…'), 'earthscope');
  await user.click(await screen.findByRole('option', { name: /earthscope_consortium/ }));
  await waitFor(() =>
    expect(fixture.repository.searchNdp).toHaveBeenCalledWith(
      {
        query: '',
        only_groups: false,
        organization: 'earthscope_consortium',
        endpoint_id: 'ocean',
      },
      expect.any(AbortSignal),
    ),
  );
  expect(screen.getByRole('combobox', { name: 'Organization filter' })).toHaveTextContent(
    'earthscope_consortium',
  );
});
it('shows an organization-list failure and retries without blocking dataset browsing', async () => {
  fixture.repository.ndpOrganizations.mockRejectedValueOnce(new Error('Offline'));
  show();
  const user = userEvent.setup();
  await user.click(screen.getByRole('combobox', { name: 'Organization filter' }));
  expect(await screen.findByRole('alert')).toHaveTextContent('Organizations unavailable.');
  await user.click(screen.getByRole('button', { name: 'Retry' }));
  expect(await screen.findByRole('option', { name: /earthscope_consortium/ })).toBeVisible();
  expect(screen.queryByRole('alert')).toBeNull();
});
afterEach(() => {
  cleanup();
  vi.useRealTimers();
  vi.unstubAllGlobals();
});
function show(
  onConnected = vi.fn(),
  client = new QueryClient({ defaultOptions: { queries: { retry: false } } }),
) {
  const view = render(
    <QueryClientProvider client={client}>
      <NDPSourcePicker
        workspaceId="workspace"
        provider={provider}
        onConnected={onConnected}
        onBack={vi.fn()}
      />
    </QueryClientProvider>,
  );
  return { onConnected, client, ...view };
}
it('connects selected metadata for source review without creating a link or message attachment', async () => {
  const { onConnected } = show();
  const user = userEvent.setup();
  await user.click(await screen.findByRole('button', { name: /Sea observations/ }));
  expect(screen.queryByText('Viewer')).not.toBeInTheDocument();
  expect(screen.queryByText(/Nothing is downloaded/)).not.toBeInTheDocument();
  expect(fixture.repository.attachNdp).not.toHaveBeenCalled();
  await user.click(screen.getByRole('checkbox', { name: /stations.csv/ }));
  await user.click(screen.getByRole('button', { name: 'Connect' }));
  await waitFor(() => expect(onConnected).toHaveBeenCalledWith([{ id: 'sea', label: 'sea' }]));
  expect(fixture.repository.attachNdp).toHaveBeenCalledWith('workspace', {
    endpoint_id: 'ocean',
    dataset_id: 'sea',
    resource_ids: ['stations'],
  });
  expect(fixture.repository.beginSourceDraft).not.toHaveBeenCalled();
  expect(fixture.repository.attachSourceFolder).not.toHaveBeenCalled();
});

it('retains selected dataset resources while inspecting endpoint connections', async () => {
  show();
  const user = userEvent.setup();
  await user.click(await screen.findByRole('button', { name: /Sea observations/ }));
  await user.click(screen.getByRole('checkbox', { name: /stations.csv/ }));
  await user.click(screen.getByRole('radio', { name: 'Endpoints & streams' }));
  await screen.findByLabelText('Endpoint connection method');
  await user.click(screen.getByRole('radio', { name: 'Datasets' }));
  expect(screen.getByRole('checkbox', { name: /stations.csv/ })).toBeChecked();
  expect(screen.getByRole('button', { name: 'Selected (1)' })).toBeVisible();
});
it('filters immediately across names, descriptions, endpoints and files before the remote debounce', async () => {
  vi.useFakeTimers();
  fixture.repository.searchNdp
    .mockResolvedValueOnce({ datasets: [dataset, second], warnings: [] })
    .mockImplementation(() => new Promise(() => undefined));
  show();
  await act(async () => {
    await vi.advanceTimersByTimeAsync(1);
  });
  expect(screen.getByRole('button', { name: /Weather records/ })).toBeVisible();
  const input = screen.getByRole('textbox', { name: 'Search NDP datasets' });
  fireEvent.change(input, { target: { value: 'ocean' } });
  fireEvent.change(input, { target: { value: 'ocean stat' } });
  expect(screen.getByRole('button', { name: /Sea observations/ })).toBeVisible();
  expect(screen.queryByRole('button', { name: /Weather records/ })).not.toBeInTheDocument();
  expect(fixture.repository.searchNdp).toHaveBeenCalledTimes(1);
  await act(async () => {
    await vi.advanceTimersByTimeAsync(301);
  });
  expect(fixture.repository.searchNdp).toHaveBeenCalledTimes(2);
  expect(fixture.repository.searchNdp).toHaveBeenLastCalledWith(
    { query: 'ocean stat', only_groups: false },
    expect.any(AbortSignal),
  );
  expect(screen.getByRole('button', { name: /Sea observations/ })).toBeVisible();
  fireEvent.click(screen.getByRole('button', { name: 'Clear search' }));
  expect(input).toHaveFocus();
  await act(async () => {
    await vi.advanceTimersByTimeAsync(1);
  });
  expect(screen.getByRole('button', { name: /Weather records/ })).toBeVisible();
});
it('browses collapsed titles and opens matching resources when searching', async () => {
  show();
  const user = userEvent.setup();
  expect(await screen.findByRole('button', { name: /Sea observations/ })).toHaveAttribute(
    'aria-expanded',
    'false',
  );
  expect(screen.queryByText('Measured waves')).not.toBeInTheDocument();
  expect(screen.queryByRole('checkbox')).not.toBeInTheDocument();
  expect(screen.queryByText('Océan Endpoint')).not.toBeInTheDocument();
  await user.type(screen.getByRole('textbox', { name: 'Search NDP datasets' }), 'station');
  expect(screen.getByRole('checkbox', { name: /stations.csv/ })).toBeVisible();
  await user.click(screen.getByRole('button', { name: 'Clear search' }));
  expect(screen.queryByRole('checkbox')).not.toBeInTheDocument();
});
it('preserves selections from different searches and connects every selected dataset', async () => {
  fixture.repository.searchNdp.mockImplementation(async ({ query }) => ({
    datasets: query ? [second] : [dataset],
    warnings: [],
  }));
  const { onConnected } = show();
  const user = userEvent.setup();
  await user.click(await screen.findByRole('button', { name: /Sea observations/ }));
  await user.click(screen.getByRole('checkbox', { name: /stations.csv/ }));
  await user.type(screen.getByRole('textbox', { name: 'Search NDP datasets' }), 'weather');
  await screen.findByRole('checkbox', { name: /temperatures.nc/ });
  await user.click(screen.getByRole('checkbox', { name: /temperatures.nc/ }));
  await user.click(screen.getByRole('button', { name: 'Selected (2)' }));
  expect(screen.getByRole('button', { name: /Sea observations/ })).toBeVisible();
  await user.click(screen.getByRole('button', { name: 'Connect' }));
  await waitFor(() =>
    expect(onConnected).toHaveBeenCalledWith([
      { id: 'sea', label: 'sea' },
      { id: 'weather', label: 'weather' },
    ]),
  );
  expect(fixture.repository.attachNdp).toHaveBeenNthCalledWith(1, 'workspace', {
    endpoint_id: 'ocean',
    dataset_id: 'sea',
    resource_ids: ['stations'],
  });
  expect(fixture.repository.attachNdp).toHaveBeenNthCalledWith(2, 'workspace', {
    endpoint_id: 'ocean',
    dataset_id: 'weather',
    resource_ids: ['air'],
  });
});
it('shows a live access-check warning and passes the group filter without dropping selection', async () => {
  fixture.repository.searchNdp.mockResolvedValue({
    datasets: [dataset],
    warnings: ['NDP could not check Endpoint access.'],
  });
  show();
  const user = userEvent.setup();
  expect(await screen.findByText('NDP could not check Endpoint access.')).toBeVisible();
  expect(screen.queryByText('Request access')).not.toBeInTheDocument();
  await user.click(screen.getByRole('button', { name: /Sea observations/ }));
  expect(screen.getByRole('checkbox', { name: /stations.csv/ })).toBeVisible();
  await user.click(screen.getByRole('checkbox', { name: /stations.csv/ }));
  await user.selectOptions(
    screen.getByRole('combobox', { name: 'Catalog access filter' }),
    'groups',
  );
  await waitFor(() =>
    expect(fixture.repository.searchNdp).toHaveBeenLastCalledWith(
      { query: '', only_groups: true },
      expect.any(AbortSignal),
    ),
  );
  expect(screen.getByRole('button', { name: 'Selected (1)' })).toBeVisible();
});
it('keeps loaded matches usable when a background refresh fails', async () => {
  fixture.repository.searchNdp
    .mockResolvedValueOnce({ datasets: [dataset], warnings: [] })
    .mockRejectedValue(new Error('Catalog search is unavailable.'));
  show();
  const user = userEvent.setup();
  await screen.findByRole('button', { name: /Sea observations/ });
  await user.click(screen.getByRole('button', { name: 'Refresh catalog' }));
  expect(await screen.findByRole('alert')).toHaveTextContent('Catalog search is unavailable.');
  expect(screen.getByRole('button', { name: /Sea observations/ })).toBeVisible();
  expect(screen.getByText('Showing saved results.')).toBeVisible();
});
it('shows cached initial results immediately and refreshes when reopening the picker', async () => {
  const { unmount, client } = show();
  await screen.findByRole('button', { name: /Sea observations/ });
  unmount();
  show(vi.fn(), client);
  expect(screen.getByRole('button', { name: /Sea observations/ })).toBeVisible();
  await waitFor(() => expect(fixture.repository.searchNdp).toHaveBeenCalledTimes(2));
});
it('browses a large catalog page without mounting thousands of resource controls', async () => {
  const resources = Array.from({ length: 200 }, (_, index) => ({
    ...dataset.resources[0],
    id: `resource-${index}`,
  }));
  fixture.repository.searchNdp.mockResolvedValue({
    datasets: Array.from({ length: 30 }, (_, index) => ({
      ...dataset,
      id: `dataset-${index}`,
      title: `Measurements ${index}`,
      resources,
    })),
    total: 6235,
    next_offset: 30,
    warnings: [],
  });
  show();
  expect(await screen.findByText('30 of 6,235 datasets')).toBeVisible();
  const list = screen.getByRole('region', { name: 'NDP datasets' });
  expect(list.querySelectorAll('button')).toHaveLength(30);
  expect(list.querySelectorAll('[role="checkbox"]')).toHaveLength(0);
  expect(fixture.repository.searchNdp).toHaveBeenCalledTimes(1);
});
it('loads the next catalog page while retaining earlier selections', async () => {
  fixture.repository.searchNdp
    .mockResolvedValueOnce({ datasets: [dataset], warnings: [], total: 2, next_offset: 30 })
    .mockResolvedValue({ datasets: [second], warnings: [], total: 2, next_offset: null });
  show();
  const user = userEvent.setup();
  await user.click(await screen.findByRole('button', { name: /Sea observations/ }));
  await user.click(screen.getByRole('checkbox', { name: /stations.csv/ }));
  await user.click(screen.getByRole('button', { name: 'Show more datasets' }));
  expect(await screen.findByRole('button', { name: /Weather records/ })).toBeVisible();
  expect(screen.getByRole('checkbox', { name: /stations.csv/ })).toBeChecked();
  expect(fixture.repository.searchNdp).toHaveBeenLastCalledWith(
    { query: '', only_groups: false, offset: 30 },
    expect.any(AbortSignal),
  );
  expect(screen.queryByRole('button', { name: 'Show more datasets' })).not.toBeInTheDocument();
});
it('keeps a loaded file-format match when the remote full-text index misses it', async () => {
  fixture.repository.searchNdp
    .mockResolvedValueOnce({ datasets: [dataset], warnings: [] })
    .mockResolvedValue({ datasets: [], warnings: [] });
  show();
  const user = userEvent.setup();
  await screen.findByRole('button', { name: /Sea observations/ });
  await user.type(screen.getByRole('textbox', { name: 'Search NDP datasets' }), 'csv');
  await waitFor(() =>
    expect(fixture.repository.searchNdp).toHaveBeenLastCalledWith(
      { query: 'csv', only_groups: false },
      expect.any(AbortSignal),
    ),
  );
  expect(screen.getByRole('button', { name: /Sea observations/ })).toBeVisible();
});
it('refreshes an expired backend selection once while retaining the exact chosen IDs', async () => {
  fixture.repository.attachNdp
    .mockRejectedValueOnce(new Error('Search for this NDP dataset again before attaching it'))
    .mockResolvedValue({ id: 'sea', label: 'sea' });
  const { onConnected } = show();
  const user = userEvent.setup();
  await user.click(await screen.findByRole('button', { name: /Sea observations/ }));
  await user.click(screen.getByRole('checkbox', { name: /stations.csv/ }));
  await user.click(screen.getByRole('button', { name: 'Connect' }));
  await waitFor(() => expect(onConnected).toHaveBeenCalledOnce());
  expect(fixture.repository.searchNdp).toHaveBeenLastCalledWith({
    query: dataset.name,
    endpoint_id: 'ocean',
  });
  expect(fixture.repository.attachNdp).toHaveBeenCalledTimes(2);
  expect(fixture.repository.attachNdp.mock.calls[1]).toEqual(
    fixture.repository.attachNdp.mock.calls[0],
  );
});
it('keeps selection available when connecting fails and supports clearing it', async () => {
  fixture.repository.attachNdp.mockRejectedValue(new Error('NDP selection expired. Search again.'));
  show();
  const user = userEvent.setup();
  await user.click(await screen.findByRole('button', { name: /Sea observations/ }));
  await user.click(screen.getByRole('checkbox', { name: /stations.csv/ }));
  await user.click(screen.getByRole('button', { name: 'Connect' }));
  expect(await screen.findByRole('alert')).toHaveTextContent('Search again');
  expect(screen.getByRole('checkbox', { name: /stations.csv/ })).toBeChecked();
  await user.click(screen.getByRole('button', { name: 'Clear selection' }));
  expect(screen.getByRole('button', { name: 'Connect' })).toBeDisabled();
});
