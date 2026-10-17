import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { cleanup, render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, beforeEach, expect, it, vi } from 'vitest';
import type { SourceProvider } from '@clio/core/v3';
import { NDPSourcePicker } from './ndp-source-picker';

const fixture = vi.hoisted(() => ({
  repository: {
    searchNdp: vi.fn(),
    attachNdp: vi.fn(),
    beginSourceDraft: vi.fn(),
    attachSourceFolder: vi.fn(),
  },
}));
vi.mock('@/hooks/use-repository', () => ({ useRepository: () => fixture.repository }));
vi.mock('@/providers/connection-provider', () => ({
  useConnectionSettings: () => ({
    settings: { endpoint: 'https://clio.test', token: '' },
  }),
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
  name: 'sea',
  title: 'Sea observations',
  description: 'Measured waves',
  endpoint_id: 'ocean',
  endpoint_name: 'Ocean Endpoint',
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
beforeEach(() => {
  vi.resetAllMocks();
  fixture.repository.searchNdp.mockResolvedValue({ datasets: [dataset], warnings: [] });
  fixture.repository.attachNdp.mockResolvedValue({ id: 'source', label: 'Sea observations' });
  fixture.repository.beginSourceDraft.mockResolvedValue({ id: 'lease' });
  fixture.repository.attachSourceFolder.mockResolvedValue({
    id: 'resource',
    detected_mime: 'application/json',
    revision: 1,
  });
});
afterEach(cleanup);
function show(onSelect = vi.fn()) {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  render(
    <QueryClientProvider client={client}>
      <NDPSourcePicker
        workspaceId="workspace"
        provider={provider}
        onSelect={onSelect}
        onBack={vi.fn()}
        onChanged={vi.fn()}
      />
    </QueryClientProvider>,
  );
  return onSelect;
}
it('selects catalog resource IDs and attaches a normal source reference without a download', async () => {
  const onSelect = show();
  const user = userEvent.setup();
  await user.click(await screen.findByRole('button', { name: /Sea observations/ }));
  expect(screen.queryByText('Viewer')).not.toBeInTheDocument();
  expect(screen.getByText(/Nothing is downloaded/)).toBeVisible();
  expect(fixture.repository.attachNdp).not.toHaveBeenCalled();
  await user.click(screen.getByRole('checkbox', { name: /stations.csv/ }));
  await user.click(screen.getByRole('button', { name: 'Attach 1 resource' }));
  await waitFor(() =>
    expect(onSelect).toHaveBeenCalledWith(
      expect.objectContaining({
        id: 'resource',
        navigation: expect.objectContaining({
          source_id: 'source',
          source_provider: 'ndp',
          source_linked: 'true',
        }),
      }),
    ),
  );
  expect(fixture.repository.attachNdp).toHaveBeenCalledWith('workspace', {
    endpoint_id: 'ocean',
    dataset_id: 'sea',
    resource_ids: ['stations'],
  });
});
it('shows an access-check outage without inventing badges and passes the group filter', async () => {
  fixture.repository.searchNdp.mockResolvedValue({
    datasets: [dataset],
    warnings: ['NDP could not check Endpoint access.'],
  });
  show();
  const user = userEvent.setup();
  expect(await screen.findByText('NDP could not check Endpoint access.')).toBeVisible();
  expect(screen.queryByText('Request access')).not.toBeInTheDocument();
  await user.selectOptions(screen.getByRole('combobox', { name: 'Endpoint filter' }), 'groups');
  await waitFor(() =>
    expect(fixture.repository.searchNdp).toHaveBeenLastCalledWith(
      { query: '', only_groups: true },
      expect.any(AbortSignal),
    ),
  );
});
it('keeps the selection available when attaching fails', async () => {
  fixture.repository.attachNdp.mockRejectedValue(new Error('NDP selection expired. Search again.'));
  show();
  const user = userEvent.setup();
  await user.click(await screen.findByRole('button', { name: /Sea observations/ }));
  await user.click(screen.getByRole('checkbox', { name: /stations.csv/ }));
  await user.click(screen.getByRole('button', { name: 'Attach 1 resource' }));
  expect(await screen.findByRole('alert')).toHaveTextContent('Search again');
  expect(screen.getByRole('checkbox', { name: /stations.csv/ })).toBeChecked();
});
