import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { cleanup, render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, expect, it, vi } from 'vitest';
import { FleetSettingsPanel } from './settings-fleet';

const { repository } = vi.hoisted(() => ({
  repository: { fleetSettings: vi.fn(), updateFleetSettings: vi.fn() },
}));
vi.mock('@/hooks/use-repository', () => ({ useRepository: () => repository }));
vi.mock('@/providers/connection-provider', () => ({
  useConnectionSettings: () => ({ settings: { endpoint: 'test' } }),
}));
vi.mock('@/hooks/use-provider-groups', () => ({
  useProviderGroups: () => ({
    options: [],
    catalog: { isPending: false, isError: false, refetch: vi.fn() },
  }),
}));
vi.mock('./model-picker', () => ({
  ClioModelPicker: ({
    title,
    onChange,
    trigger,
  }: {
    title: string;
    onChange: (choice: { providerId: string; id: string }) => void;
    trigger: React.ReactNode;
  }) => (
    <div>
      {trigger}
      <button onClick={() => onChange({ providerId: 'codex', id: 'gpt-6-luna' })}>{title}</button>
    </div>
  ),
}));
afterEach(() => {
  cleanup();
  vi.clearAllMocks();
});

it('inherits three conversation models and changes only the selected judge role', async () => {
  const initial = { revision: 'r1', judges: { goals: null, variants: null, permissions: null } };
  repository.fleetSettings.mockResolvedValue(initial);
  repository.updateFleetSettings.mockImplementation(async (value) => ({
    ...value,
    revision: 'r2',
  }));
  render(
    <QueryClientProvider
      client={new QueryClient({ defaultOptions: { queries: { retry: false } } })}
    >
      <FleetSettingsPanel />
    </QueryClientProvider>,
  );
  expect(await screen.findAllByRole('button', { name: 'Conversation model' })).toHaveLength(3);
  await userEvent.setup().click(screen.getByRole('button', { name: 'Choose Goals judge' }));
  await waitFor(() =>
    expect(repository.updateFleetSettings).toHaveBeenCalledWith({
      ...initial,
      judges: { ...initial.judges, goals: { provider_id: 'codex', model_id: 'gpt-6-luna' } },
    }),
  );
  await userEvent
    .setup()
    .click(await screen.findByRole('button', { name: 'Use conversation model' }));
  await waitFor(() =>
    expect(repository.updateFleetSettings).toHaveBeenLastCalledWith({
      revision: 'r2',
      judges: initial.judges,
    }),
  );
});

it('chooses and resets the SPOTTER default model, keeping the judges as they were', async () => {
  const initial = {
    revision: 'r1',
    judges: { goals: null, variants: null, permissions: null },
    spotter: null,
  };
  repository.fleetSettings.mockResolvedValue(initial);
  repository.updateFleetSettings.mockImplementation(async (value) => ({
    ...value,
    revision: 'r2',
  }));
  render(
    <QueryClientProvider
      client={new QueryClient({ defaultOptions: { queries: { retry: false } } })}
    >
      <FleetSettingsPanel />
    </QueryClientProvider>,
  );
  const user = userEvent.setup();
  await user.click(await screen.findByRole('button', { name: 'Choose SPOTTER model' }));
  await waitFor(() =>
    expect(repository.updateFleetSettings).toHaveBeenCalledWith({
      ...initial,
      spotter: { provider_id: 'codex', model_id: 'gpt-6-luna' },
    }),
  );
  await user.click(await screen.findByRole('button', { name: 'Use conversation model' }));
  await waitFor(() =>
    expect(repository.updateFleetSettings).toHaveBeenLastCalledWith({
      ...initial,
      revision: 'r2',
    }),
  );
});

it('hides the SPOTTER row for a service that predates it', async () => {
  repository.fleetSettings.mockResolvedValue({
    revision: 'r1',
    judges: { goals: null, variants: null, permissions: null },
  });
  render(
    <QueryClientProvider
      client={new QueryClient({ defaultOptions: { queries: { retry: false } } })}
    >
      <FleetSettingsPanel />
    </QueryClientProvider>,
  );
  expect(await screen.findByRole('button', { name: 'Choose Goals judge' })).toBeVisible();
  expect(screen.queryByRole('button', { name: 'Choose SPOTTER model' })).toBeNull();
});
