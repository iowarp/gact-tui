import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { cleanup, render, screen } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { connectionIndicatorState } from '@/hooks/use-connection-indicator-state';
import { useLiveStore } from '@/store/live-store';
import { LiveConnectionIndicator } from './live-connection-indicator';

const repository = vi.hoisted(() => ({
  capabilities: vi.fn(),
  languageModelConfiguration: vi.fn(async () => ({ configured: false, presets: [] })),
}));

vi.mock('@/hooks/use-repository', () => ({ useRepository: () => repository }));
vi.mock('@/providers/connection-provider', () => ({
  useConnectionSettings: () => ({ settings: { endpoint: 'http://127.0.0.1:8787' } }),
}));

function renderIndicator() {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  render(
    <QueryClientProvider client={client}>
      <LiveConnectionIndicator />
    </QueryClientProvider>,
  );
}

beforeEach(() => {
  useLiveStore.getState().reset();
  useLiveStore.setState({ streamOwners: 0 });
  repository.capabilities.mockResolvedValue({ service: { name: 'svc', version: '1' } });
});

afterEach(() => {
  cleanup();
  vi.clearAllMocks();
});

describe('LiveConnectionIndicator', () => {
  it('reads Live on a route with no session stream (Settings) while the service answers', async () => {
    // The live store still holds its initial "offline": no stream ever opened here.
    expect(useLiveStore.getState().entities.stream).toBe('offline');
    renderIndicator();

    expect(await screen.findByRole('status', { name: 'Live' })).toBeVisible();
  });

  it('reads Offline on such a route when the service does not answer', async () => {
    repository.capabilities.mockRejectedValue(new Error('connection refused'));
    renderIndicator();

    expect(await screen.findByRole('status', { name: 'Offline' })).toBeVisible();
  });

  it('follows the open session stream where one exists', async () => {
    useLiveStore.getState().claimStream();
    useLiveStore.getState().setStreamState('reconnecting');
    renderIndicator();

    expect(await screen.findByRole('status', { name: 'Reconnecting' })).toBeVisible();
  });
});

describe('connectionIndicatorState', () => {
  it('ignores a stale stream value when no stream is open', () => {
    expect(
      connectionIndicatorState({ streamOwned: false, stream: 'live', service: 'unreachable' }),
    ).toBe('offline');
    expect(
      connectionIndicatorState({ streamOwned: false, stream: 'offline', service: 'checking' }),
    ).toBe('connecting');
  });

  it('lets an open stream decide', () => {
    expect(
      connectionIndicatorState({ streamOwned: true, stream: 'gapped', service: 'reachable' }),
    ).toBe('gapped');
  });
});
