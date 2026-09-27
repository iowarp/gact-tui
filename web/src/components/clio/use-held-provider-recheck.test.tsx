import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { renderHook, waitFor } from '@testing-library/react';
import type { ReactNode } from 'react';
import { describe, expect, it, vi } from 'vitest';
import { useHeldProviderRecheck } from './use-held-provider-recheck';

const { repository } = vi.hoisted(() => ({
  repository: { providerHandshake: vi.fn().mockResolvedValue({ auth: 'ok' }) },
}));

vi.mock('@/hooks/use-repository', () => ({ useRepository: () => repository }));
vi.mock('@/providers/connection-provider', () => ({
  useConnectionSettings: () => ({ settings: { endpoint: 'http://127.0.0.1:8787' } }),
}));

function wrapper(client: QueryClient) {
  return ({ children }: { children: ReactNode }) => (
    <QueryClientProvider client={client}>{children}</QueryClientProvider>
  );
}

describe('useHeldProviderRecheck (#1455)', () => {
  it('asks a held provider again once, then refreshes the provider list', async () => {
    const client = new QueryClient();
    const invalidate = vi.spyOn(client, 'invalidateQueries');
    const { rerender } = renderHook(({ id }) => useHeldProviderRecheck(id), {
      initialProps: { id: 'claude_code' as string | undefined },
      wrapper: wrapper(client),
    });
    rerender({ id: 'claude_code' });

    await waitFor(() => expect(invalidate).toHaveBeenCalled());
    expect(repository.providerHandshake).toHaveBeenCalledTimes(1);
    expect(repository.providerHandshake).toHaveBeenCalledWith('claude_code', { refresh: true });
  });

  it('asks nothing when no pick is held', () => {
    repository.providerHandshake.mockClear();
    renderHook(() => useHeldProviderRecheck(undefined), { wrapper: wrapper(new QueryClient()) });

    expect(repository.providerHandshake).not.toHaveBeenCalled();
  });
});
