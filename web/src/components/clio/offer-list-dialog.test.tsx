import type { OfferList } from '@clio/core/v3';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { cleanup, render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, expect, it, vi } from 'vitest';
import { TooltipProvider } from '@/components/ui/tooltip';
import { OfferListDialog } from './offer-list-dialog';

const { repository } = vi.hoisted(() => ({
  repository: { saveOfferList: vi.fn(), resetOfferList: vi.fn(), connectorLogo: vi.fn() },
}));
vi.mock('@/hooks/use-repository', () => ({ useRepository: () => repository }));
vi.mock('@/providers/connection-provider', () => ({
  useConnectionSettings: () => ({ settings: { endpoint: 'http://agent' } }),
}));
vi.mock('sonner', async (original) => ({
  ...(await original<typeof import('sonner')>()),
  toast: Object.assign(vi.fn(), { success: vi.fn(), error: vi.fn(), dismiss: vi.fn() }),
}));
afterEach(() => {
  cleanup();
  vi.clearAllMocks();
});

/** 25 candidates, the first 20 listed by default; even ones are connectors. */
function list(): OfferList {
  const entries = Array.from({ length: 25 }, (_, index) => {
    const connector = index % 2 === 0;
    const name = `Entry ${String(index + 1).padStart(2, '0')}`;
    return {
      key: connector ? `connector:e${index + 1}` : `plugin:lab/e${index + 1}`,
      kind: connector ? ('connector' as const) : ('plugin' as const),
      id: `e${index + 1}`,
      name,
      summary: `What ${name} brings.`,
      logo_url: null,
      logo_dark_url: null,
      default_listed: index < 20,
      listed: index < 20,
    };
  });
  return {
    cap: 20,
    total: 25,
    listed_count: 20,
    customized: false,
    include: [],
    exclude: [],
    entries,
  };
}

function open(value: OfferList = list()) {
  const onOpenChange = vi.fn();
  render(
    <QueryClientProvider client={new QueryClient()}>
      <TooltipProvider>
        <OfferListDialog list={value} onOpenChange={onOpenChange} open />
      </TooltipProvider>
    </QueryClientProvider>,
  );
  return onOpenChange;
}

const count = () => screen.getByText(/of 25 brought in/).textContent;

it('shows every candidate with the default ones ticked and marked, and kinds apart', () => {
  open();
  expect(count()).toContain('20 of 25 brought in');
  expect(screen.getAllByRole('checkbox', { checked: true })).toHaveLength(20);
  expect(screen.getAllByText('Default')).toHaveLength(20);
  expect(screen.getAllByText('Connector')).toHaveLength(13);
  expect(screen.getAllByText('Plugin')).toHaveLength(12);
  expect(screen.queryByText(/connector:e1/)).toBeNull(); // keys are never shown
});

it('saves an untick inside the default and a tick beyond it as the overlay', async () => {
  repository.saveOfferList.mockResolvedValue({ ...list(), customized: true });
  const onOpenChange = open();
  const user = userEvent.setup();
  await user.click(screen.getByRole('checkbox', { name: 'Bring in Entry 01' }));
  await user.click(screen.getByRole('checkbox', { name: 'Bring in Entry 02' }));
  await user.click(screen.getByRole('checkbox', { name: 'Bring in Entry 21' }));
  await user.click(screen.getByRole('checkbox', { name: 'Bring in Entry 24' }));
  await user.click(screen.getByRole('checkbox', { name: 'Bring in Entry 25' }));
  expect(count()).toContain('21 of 25 brought in');
  await user.click(screen.getByRole('button', { name: /^Save/ }));
  await waitFor(() =>
    expect(repository.saveOfferList).toHaveBeenCalledWith({
      include: ['connector:e21', 'plugin:lab/e24', 'connector:e25'],
      exclude: ['connector:e1', 'plugin:lab/e2'],
    }),
  );
  await waitFor(() => expect(onOpenChange).toHaveBeenCalledWith(false));
});

it('resets to the default list, which saves as a reset', async () => {
  repository.resetOfferList.mockResolvedValue(list());
  const value = list();
  value.entries[0] = { ...value.entries[0]!, listed: false };
  value.entries[22] = { ...value.entries[22]!, listed: true };
  open(value);
  const user = userEvent.setup();
  expect(screen.getByRole('checkbox', { name: 'Bring in Entry 23' })).toHaveProperty(
    'ariaChecked',
    'true',
  );
  await user.click(screen.getByRole('button', { name: 'Reset to default' }));
  expect(count()).toContain('20 of 25 brought in');
  expect(screen.getByRole('button', { name: 'Reset to default' })).toHaveProperty('disabled', true);
  await user.click(screen.getByRole('button', { name: /^Save/ }));
  await waitFor(() => expect(repository.resetOfferList).toHaveBeenCalled());
  expect(repository.saveOfferList).not.toHaveBeenCalled();
});

it('searches a long list by name and summary', async () => {
  open();
  const user = userEvent.setup();
  await user.type(screen.getByRole('searchbox', { name: 'Search plugins and connectors' }), '2');
  expect(screen.getAllByRole('checkbox')).toHaveLength(8); // Entry 02, 12 and 20 to 25
  await user.clear(screen.getByRole('searchbox'));
  await user.type(screen.getByRole('searchbox'), 'zzz');
  expect(screen.getByText('Nothing matches “zzz”.')).toBeTruthy();
});
