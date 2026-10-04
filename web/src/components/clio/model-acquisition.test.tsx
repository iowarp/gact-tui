import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { cleanup, render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { MemoryRouter } from 'react-router-dom';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

const fixtures = vi.hoisted(() => ({
  repository: {
    modelInventory: vi.fn(),
    hostStorageSettings: vi.fn(),
    searchModels: vi.fn(),
    acquireModel: vi.fn(),
    modelAcquisitionAction: vi.fn(),
  },
}));
vi.mock('@/hooks/use-repository', () => ({ useRepository: () => fixtures.repository }));
vi.mock('@/providers/connection-provider', () => ({
  useConnectionSettings: () => ({ settings: { endpoint: 'https://connected-clio' } }),
}));
import { ModelAcquisitions } from './model-acquisition';

beforeEach(() => {
  vi.resetAllMocks();
  fixtures.repository.modelInventory.mockResolvedValue({
    models: [],
    errors: [],
    unavailable_reason: null,
  });
  fixtures.repository.hostStorageSettings.mockResolvedValue({
    effective: { models: '/data/models' },
  });
});
afterEach(cleanup);
function mount() {
  return render(
    <QueryClientProvider
      client={new QueryClient({ defaultOptions: { queries: { retry: false } } })}
    >
      <MemoryRouter>
        <ModelAcquisitions targetId="homelab" hostLabel="Homelab" />
      </MemoryRouter>
    </QueryClientProvider>,
  );
}
describe('host model acquisition', () => {
  it('downloads an explicitly selected revision on the named host without starting inference', async () => {
    const user = userEvent.setup();
    fixtures.repository.searchModels.mockResolvedValue({
      models: [
        { repository: 'org/small', revision: 'abcdef', task: 'text-generation', gated: false },
      ],
    });
    fixtures.repository.acquireModel.mockResolvedValue({ id: 'job' });
    mount();
    await screen.findByText('No downloaded models on this host yet.');
    await user.click(screen.getByRole('button', { name: 'Download model' }));
    await user.type(screen.getByLabelText('Find on Hugging Face'), 'small');
    await user.click(screen.getByRole('button', { name: 'Search models' }));
    await user.click(await screen.findByRole('button', { name: /org\/small/ }));
    expect(screen.getByLabelText('Revision')).toHaveValue('abcdef');
    await user.type(screen.getByLabelText('Destination on Homelab'), '/data/owned/model');
    await user.click(screen.getByRole('button', { name: 'Download to host' }));
    await waitFor(() =>
      expect(fixtures.repository.acquireModel).toHaveBeenCalledWith('homelab', {
        repository: 'org/small',
        revision: 'abcdef',
        destination: '/data/owned/model',
      }),
    );
    expect(fixtures.repository.modelAcquisitionAction).not.toHaveBeenCalled();
  });
  it('scopes cancellation to the recorded host and job', async () => {
    fixtures.repository.modelInventory.mockResolvedValue({
      models: [
        {
          id: 'job',
          repository: 'org/small',
          requested_revision: 'main',
          revision: 'abcdef',
          destination: '/data/model',
          state: 'running',
          phase: 'Downloading model files',
          bytes_done: 10,
          bytes_total: 20,
          updated_at: 1,
        },
      ],
      errors: [],
      unavailable_reason: null,
    });
    fixtures.repository.modelAcquisitionAction.mockResolvedValue({ id: 'job' });
    mount();
    await userEvent.click(await screen.findByRole('button', { name: 'Cancel download' }));
    await waitFor(() =>
      expect(fixtures.repository.modelAcquisitionAction).toHaveBeenCalledWith(
        'homelab',
        'job',
        'cancel',
      ),
    );
  });
  it('disables unavailable modes and explains them through an accessible info control', async () => {
    fixtures.repository.modelInventory.mockResolvedValue({
      models: [],
      errors: [],
      unavailable_reason: 'Connect the execution host first.',
    });
    mount();
    await screen.findByText('No downloaded models on this host yet.');
    expect(screen.getByRole('button', { name: 'Download model' })).toBeDisabled();
    await userEvent.click(screen.getByRole('button', { name: 'Why downloading is unavailable' }));
    expect(await screen.findByText('Connect the execution host first.')).toBeInTheDocument();
  });
});
