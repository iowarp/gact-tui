import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { act, renderHook, waitFor } from '@testing-library/react';
import type { ReactNode } from 'react';
import { beforeEach, describe, expect, it, vi } from 'vitest';

const repository = vi.hoisted(() => ({
  providerCatalog: vi.fn(),
  refreshProviderModels: vi.fn(),
}));

vi.mock('./use-repository', () => ({ useRepository: () => repository }));
vi.mock('@/providers/connection-provider', () => ({
  useConnectionSettings: () => ({
    credentialsReady: true,
    settings: { endpoint: 'http://127.0.0.1:8790' },
  }),
}));

import { useProviderCatalog } from './use-provider-catalog';

const initialCatalog = { authoritative: 'live_handshake', providers: [] };
const refreshedCatalog = {
  authoritative: 'live_handshake',
  providers: [{ id: 'claude_code', name: 'Claude Code' }],
};

function wrapper({ children }: { children: ReactNode }) {
  const client = new QueryClient({
    defaultOptions: { mutations: { retry: false }, queries: { retry: false } },
  });
  return <QueryClientProvider client={client}>{children}</QueryClientProvider>;
}

beforeEach(() => {
  vi.clearAllMocks();
  repository.providerCatalog.mockImplementation(async (refresh: boolean) =>
    refresh ? refreshedCatalog : initialCatalog,
  );
  repository.refreshProviderModels.mockResolvedValue([]);
});

describe('useProviderCatalog', () => {
  it('warms the cached catalog as soon as the connected backend is ready', async () => {
    const { result } = renderHook(() => useProviderCatalog(), { wrapper });

    await waitFor(() => expect(result.current.data).toEqual(initialCatalog));
    expect(repository.providerCatalog).toHaveBeenCalledWith(false, expect.any(AbortSignal));
  });

  it('explicitly refreshes one provider and replaces the shared snapshot', async () => {
    const { result } = renderHook(() => useProviderCatalog(), { wrapper });
    await waitFor(() => expect(result.current.data).toEqual(initialCatalog));

    act(() => {
      result.current.refreshCatalog('claude_code');
    });

    await waitFor(() =>
      expect(repository.refreshProviderModels).toHaveBeenCalledWith(['claude_code']),
    );
    await waitFor(() => expect(repository.providerCatalog).toHaveBeenLastCalledWith(true));
    await waitFor(() => expect(result.current.data).toEqual(refreshedCatalog));
  });
});
