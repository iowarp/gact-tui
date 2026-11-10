import type { ProviderInstallJob } from '@clio/core/v3';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { cleanup, render, screen, waitFor } from '@testing-library/react';
import type { PropsWithChildren } from 'react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import {
  ProviderInstallMonitor,
  providerInstallStage,
  useProviderInstall,
  useProviderInstallStages,
  useProviderInstallStore,
} from './provider-install-jobs';

const repository = {
  providerInstallJobs: vi.fn(),
  providerHandshake: vi.fn(),
  providerModels: vi.fn(),
  providerCatalog: vi.fn(),
};

vi.mock('@/hooks/use-repository', () => ({ useRepository: () => repository }));
vi.mock('@/providers/connection-provider', () => ({
  useConnectionSettings: () => ({ settings: { endpoint: 'http://127.0.0.1' } }),
}));
vi.mock('sonner', () => ({ toast: { error: vi.fn() } }));

function job(state: ProviderInstallJob['state'], extra: Partial<ProviderInstallJob> = {}) {
  return {
    provider_id: 'claude_code',
    provider_kind: 'claude_code',
    state,
    running: state === 'queued' || state === 'installing',
    installed: state === 'done',
    instructions: '',
    error: undefined,
    started_at: '2026-11-10T00:00:00Z',
    finished_at: '',
    ...extra,
  } satisfies ProviderInstallJob;
}

function wrapper({ children }: PropsWithChildren) {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  return <QueryClientProvider client={client}>{children}</QueryClientProvider>;
}

function RowStages() {
  const stages = useProviderInstallStages();
  return <span data-testid="row">{stages.get('claude_code') ?? 'idle'}</span>;
}

function PanelOutcome() {
  const install = useProviderInstall('claude_code');
  return <span data-testid="panel">{install.failure ?? install.check?.auth ?? 'none'}</span>;
}

describe('provider install jobs', () => {
  afterEach(cleanup);

  beforeEach(() => {
    vi.clearAllMocks();
    useProviderInstallStore.setState({ outcomes: {} });
    repository.providerModels.mockResolvedValue({ models: [] });
    repository.providerCatalog.mockResolvedValue({ providers: [] });
  });

  it('names each running state, and nothing once it settled', () => {
    expect(providerInstallStage(job('queued'), undefined)).toBe('Waiting to install…');
    expect(providerInstallStage(job('installing'), undefined)).toBe('Installing…');
    expect(providerInstallStage(job('done'), { stage: 'Checking…' })).toBe('Checking…');
    expect(providerInstallStage(job('done'), {})).toBeUndefined();
  });

  it('keeps following an install with no provider panel open, then checks the provider', async () => {
    repository.providerInstallJobs
      .mockResolvedValueOnce([job('installing')])
      .mockResolvedValue([job('done', { finished_at: '2026-11-10T00:00:20Z' })]);
    repository.providerHandshake.mockResolvedValue({ connectivity: 'ok', auth: 'rejected' });

    const view = render(
      <>
        <ProviderInstallMonitor />
        <RowStages />
      </>,
      { wrapper },
    );
    expect(await screen.findByText('Installing…')).toBeInTheDocument();
    await waitFor(
      () =>
        expect(repository.providerHandshake).toHaveBeenCalledWith('claude_code', {
          apiBase: undefined,
          refresh: true,
        }),
      { timeout: 3000 },
    );
    await waitFor(() => expect(screen.getByTestId('row')).toHaveTextContent('idle'));
    expect(repository.providerCatalog).toHaveBeenCalledWith(false, undefined, 'claude_code');
    view.unmount();

    // The provider's panel opened afterwards reads the outcome from the store.
    render(<PanelOutcome />, { wrapper });
    expect(screen.getByTestId('panel')).toHaveTextContent('rejected');
  });

  it('keeps a failed install for the provider panel', async () => {
    repository.providerInstallJobs.mockResolvedValueOnce([job('installing')]).mockResolvedValue([
      job('failed', {
        error: { code: 'claude_code_install_failed', message: 'No network.', diagnostic: '' },
      }),
    ]);
    render(
      <>
        <ProviderInstallMonitor />
        <PanelOutcome />
      </>,
      { wrapper },
    );
    await waitFor(() => expect(screen.getByTestId('panel')).toHaveTextContent('No network.'), {
      timeout: 3000,
    });
    expect(repository.providerHandshake).not.toHaveBeenCalled();
  });
});
