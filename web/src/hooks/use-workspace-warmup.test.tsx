import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { renderHook, waitFor } from '@testing-library/react';
import { StrictMode, type PropsWithChildren } from 'react';
import { beforeEach, expect, it, vi } from 'vitest';
import { useWorkspaceWarmup } from './use-workspace-warmup';

const mocks = vi.hoisted(() => ({
  warmWorkspace: vi.fn(),
  settings: { endpoint: 'https://local.example' },
}));
vi.mock('@/hooks/use-repository', () => ({
  useRepository: () => ({ warmWorkspace: mocks.warmWorkspace }),
}));
vi.mock('@/providers/connection-provider', () => ({
  useConnectionSettings: () => ({ settings: mocks.settings }),
}));

function wrapper({ children }: PropsWithChildren) {
  return (
    <StrictMode>
      <QueryClientProvider client={client}>{children}</QueryClientProvider>
    </StrictMode>
  );
}
let client: QueryClient;
beforeEach(() => {
  client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  mocks.settings = { endpoint: 'https://local.example' };
  mocks.warmWorkspace.mockReset().mockResolvedValue({ status: 'warming' });
});

it('waits for advertised support and a resolved workspace', async () => {
  const { result, rerender } = renderHook(
    ({ enabled, workspaceId }) => useWorkspaceWarmup(workspaceId, enabled),
    { initialProps: { enabled: false, workspaceId: 'ws1' }, wrapper },
  );
  expect(mocks.warmWorkspace).not.toHaveBeenCalled();
  rerender({ enabled: true, workspaceId: '' });
  expect(mocks.warmWorkspace).not.toHaveBeenCalled();
  rerender({ enabled: true, workspaceId: 'ws1' });
  await waitFor(() => expect(result.current.isSuccess).toBe(true));
  expect(mocks.warmWorkspace.mock.calls).toEqual([['ws1']]);
});

it('prepares each workspace, connection and changed blueprint independently', async () => {
  const { result, rerender } = renderHook(
    ({ workspaceId, blueprint }) => useWorkspaceWarmup(workspaceId, true, blueprint),
    { initialProps: { workspaceId: 'ws1', blueprint: 'first' }, wrapper },
  );
  await waitFor(() => expect(result.current.isSuccess).toBe(true));
  rerender({ workspaceId: 'ws2', blueprint: 'first' });
  await waitFor(() => expect(mocks.warmWorkspace).toHaveBeenCalledTimes(2));
  mocks.settings = { endpoint: 'https://remote.example' };
  rerender({ workspaceId: 'ws2', blueprint: 'first' });
  await waitFor(() => expect(mocks.warmWorkspace).toHaveBeenCalledTimes(3));
  rerender({ workspaceId: 'ws2', blueprint: 'second' });
  await waitFor(() => expect(mocks.warmWorkspace).toHaveBeenCalledTimes(4));
});

it('coalesces StrictMode mounts and surfaces preparation failures without retry loops', async () => {
  mocks.warmWorkspace.mockRejectedValue(new Error('Service unavailable'));
  const { result } = renderHook(() => useWorkspaceWarmup('ws1', true), { wrapper });
  await waitFor(() => expect(result.current.isError).toBe(true));
  expect(result.current.error?.message).toBe('Service unavailable');
  expect(mocks.warmWorkspace).toHaveBeenCalledTimes(1);
});
