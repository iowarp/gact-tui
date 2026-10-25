import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { cleanup, render, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { MemoryRouter } from 'react-router-dom';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

const fixtures = vi.hoisted(() => ({
  repository: {
    modelInventory: vi.fn(),
    hostStorageSettings: vi.fn(),
    searchModelsPage: vi.fn(),
    acquireModel: vi.fn(),
    modelAcquisitionAction: vi.fn(),
    modelRegistryDetails: vi.fn(),
    managedServiceCatalog: vi.fn(),
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
  fixtures.repository.searchModelsPage.mockResolvedValue({
    models: [],
    next_cursor: null,
    scope: 'Popular text models on Hugging Face',
  });
  fixtures.repository.managedServiceCatalog.mockResolvedValue({
    services: [{ id: 'vllm', variants: [{ compatible: true }] }],
  });
  fixtures.repository.modelRegistryDetails.mockResolvedValue({
    repository: 'org/model',
    metadata_repository: 'org/model',
    revision: 'f'.repeat(40),
    hub_tags: ['text-generation'],
    context_window: 4096,
    native_tool_calling: null,
    reasoning: null,
    card_url: 'https://huggingface.co/org/model',
    card_markdown: '# Model card',
    card_status: 'complete',
    card_repository: 'org/model',
    card_revision: 'f'.repeat(40),
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
  it('requests image models from the Hub and follows the returned continuation', async () => {
    fixtures.repository.searchModelsPage.mockImplementation(
      async ({ filters, cursor }: { filters: string[]; cursor?: string }) => ({
        models: [
          {
            repository: cursor
              ? 'org/image-two'
              : filters.includes('input:image')
                ? 'org/image-one'
                : 'org/text',
            revision: 'abc',
            gated: false,
            capability_tags: {
              input_modalities: filters.includes('input:image')
                ? [{ value: 'image', evidence: [{ source: 'hf_repo' }] }]
                : [],
            },
          },
        ],
        next_cursor: cursor ? null : 'continuation',
        scope: 'Hugging Face search results',
      }),
    );
    mount();
    await userEvent.click(await screen.findByRole('button', { name: 'Download model' }));
    const search = screen.getByLabelText('Find on Hugging Face');
    await userEvent.type(search, 'input:image');
    await userEvent.click(screen.getByRole('button', { name: 'input:image' }));
    await waitFor(() =>
      expect(fixtures.repository.searchModelsPage).toHaveBeenCalledWith(
        { query: '', cursor: undefined, filters: ['input:image'] },
        expect.any(AbortSignal),
      ),
    );
    await userEvent.click(await screen.findByRole('button', { name: 'Load more models' }));
    await waitFor(() =>
      expect(fixtures.repository.searchModelsPage).toHaveBeenCalledWith(
        { query: '', cursor: 'continuation', filters: ['input:image'] },
        expect.any(AbortSignal),
      ),
    );
    expect(await screen.findByRole('button', { name: /org\/image-two/ })).toBeVisible();
  });
  it('opens the complete model card over the chooser and returns to the selected model', async () => {
    fixtures.repository.searchModelsPage.mockResolvedValue({
      models: [{ repository: 'org/model', revision: 'abc', gated: false }],
      next_cursor: null,
      scope: 'Loaded results',
    });
    fixtures.repository.modelRegistryDetails.mockResolvedValue({
      repository: 'org/model',
      metadata_repository: 'org/model',
      revision: 'f'.repeat(40),
      hub_tags: [],
      card_markdown:
        '# First section\n\n' +
        'A meaningful paragraph.\n\n'.repeat(30) +
        '## Final section\n\nThe card ends here.',
      card_status: 'complete',
      card_repository: 'org/model',
      card_revision: 'f'.repeat(40),
    });
    mount();
    await userEvent.click(await screen.findByRole('button', { name: 'Download model' }));
    await userEvent.click(await screen.findByRole('button', { name: /org\/model/ }));
    await userEvent.click(await screen.findByRole('button', { name: 'Model card' }));
    const card = screen.getByRole('dialog');
    await waitFor(() => expect(card).toHaveTextContent('Final section'));
    expect(card).toHaveTextContent('The card ends here.');
    await userEvent.click(within(card).getByRole('button', { name: 'Close' }));
    expect(screen.getByRole('dialog')).toHaveTextContent('Find a model');
    expect(screen.getByRole('button', { name: 'Model card' })).toBeVisible();
    expect(fixtures.repository.acquireModel).not.toHaveBeenCalled();
  });
  it('labels shared Hugging Face cache models honestly and offers no retry', async () => {
    const row = {
      id: 'hub',
      repository: 'org/shared',
      requested_revision: 'main',
      revision: 'f'.repeat(40),
      destination: '/hub/models--org--shared/snapshots/' + 'f'.repeat(40),
      phase: 'Model available (Hugging Face cache)',
      bytes_done: 4,
      bytes_total: 4,
      created_at: 1,
      updated_at: 1,
      error: null,
      origin: 'hf_cache',
    };
    fixtures.repository.modelInventory.mockResolvedValue({
      models: [
        { ...row, state: 'ready' },
        {
          ...row,
          id: 'partial',
          repository: 'org/partial',
          state: 'interrupted',
          error: 'Missing',
        },
      ],
      errors: [],
      unavailable_reason: null,
    });
    mount();
    expect(await screen.findByText('Shared cache')).toBeInTheDocument();
    expect(screen.queryByText('Files verified')).not.toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'Retry' })).not.toBeInTheDocument();
    expect(screen.getByRole('link', { name: 'Set up runtime' })).toBeInTheDocument();
    await userEvent.click(screen.getByRole('button', { name: 'Actions for org/shared' }));
    expect(screen.getByRole('menuitem', { name: 'Delete model files...' })).toHaveAttribute(
      'aria-disabled',
      'true',
    );
    expect(screen.getByText(/shared cache is managed outside/iu)).toBeVisible();
  });
  it('downloads an explicitly selected revision on the named host without starting inference', async () => {
    const user = userEvent.setup();
    fixtures.repository.searchModelsPage.mockResolvedValue({
      models: [
        { repository: 'org/small', revision: 'abcdef', task: 'text-generation', gated: false },
      ],
    });
    fixtures.repository.acquireModel.mockResolvedValue({
      id: 'job',
      repository: 'org/small',
      state: 'running',
      phase: 'Downloading model files',
      bytes_done: 10,
      bytes_total: 20,
    });
    mount();
    await screen.findByText('No downloaded models on this host yet.');
    await user.click(screen.getByRole('button', { name: 'Download model' }));
    expect(fixtures.repository.searchModelsPage).toHaveBeenCalledWith(
      { query: '', cursor: undefined, filters: [] },
      expect.any(AbortSignal),
    );
    await user.type(screen.getByLabelText('Find on Hugging Face'), 'small{Enter}');
    await user.click(await screen.findByRole('button', { name: /org\/small/ }));
    await user.click(screen.getByText('Advanced download settings', { exact: true }));
    expect(screen.getByLabelText('Revision')).toHaveValue('abcdef');
    await user.type(screen.getByLabelText('Destination on Homelab'), '/data/owned/model');
    await user.click(screen.getByRole('button', { name: 'Download to Homelab' }));
    await waitFor(() =>
      expect(fixtures.repository.acquireModel).toHaveBeenCalledWith('homelab', {
        repository: 'org/small',
        revision: 'abcdef',
        destination: '/data/owned/model',
      }),
    );
    expect(fixtures.repository.modelAcquisitionAction).not.toHaveBeenCalled();
    const progress = await screen.findByRole('progressbar', {
      name: 'Downloaded bytes for org/small',
    });
    expect(progress).toHaveAttribute('value', '10');
    expect(progress).toHaveAttribute('max', '20');
    expect(screen.getByText(/50%/u)).toBeVisible();
    expect(screen.getByRole('button', { name: 'Continue in background' })).toBeVisible();
  });
  it('sets the download expectation before it starts, with the size search reported', async () => {
    const user = userEvent.setup();
    fixtures.repository.searchModelsPage.mockResolvedValue({
      models: [
        {
          repository: 'org/large',
          revision: 'abcdef',
          task: 'text-generation',
          gated: false,
          downloads: 10,
          size_bytes: 16e9,
        },
      ],
    });
    mount();
    await screen.findByText('No downloaded models on this host yet.');
    await user.click(screen.getByRole('button', { name: 'Download model' }));
    expect(screen.getByText(/This can take several minutes/u)).toHaveTextContent(
      'prepares the model files.',
    );
    await user.type(screen.getByLabelText('Find on Hugging Face'), 'large{Enter}');
    await user.click(await screen.findByRole('button', { name: /org\/large/ }));
    const expectation = screen.getByText(/This can take several minutes/u);
    expect(expectation).toHaveTextContent(
      'prepares org/large. This can take several minutes. About 16.0 GB to download.',
    );
    expect(expectation).toHaveTextContent('You can leave this page; progress continues.');
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
    await userEvent.click(await screen.findByRole('button', { name: 'Cancel' }));
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
