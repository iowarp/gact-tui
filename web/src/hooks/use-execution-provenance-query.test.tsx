import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { act, cleanup, renderHook, waitFor } from '@testing-library/react';
import type { PropsWithChildren } from 'react';
import { afterEach, expect, it, vi } from 'vitest';
import { useExecutionProvenance } from './use-execution-provenance';

const { read } = vi.hoisted(() => ({ read: vi.fn() }));
vi.mock('@/providers/connection-provider', () => ({
  useConnectionSettings: () => ({ settings: { endpoint: 'http://provenance.test' } }),
}));
vi.mock('./use-repository', () => ({
  useRepository: () => ({
    provenanceProviders: async () => ({
      default_provider: 'native',
      providers: ['native', 'flowcept'].map((name) => ({
        name,
        configured: true,
        queryable: true,
      })),
    }),
    executionProvenance: read,
  }),
}));
afterEach(() => {
  cleanup();
  vi.clearAllMocks();
});

it('queries the session snapshot with the execution provider the user selects', async () => {
  read.mockImplementation(async (session_id: string, options: { provider: string }) => ({
    session_id,
    provider: options.provider,
    spans: [],
    nodes: [],
    edges: [],
    complete: true,
  }));
  const client = new QueryClient({ defaultOptions: { queries: { retry: false, gcTime: 0 } } });
  const wrapper = ({ children }: PropsWithChildren) => (
    <QueryClientProvider client={client}>{children}</QueryClientProvider>
  );
  const { result } = renderHook(() => useExecutionProvenance('session'), { wrapper });
  await waitFor(() => expect(result.current.execution.data?.provider).toBe('native'));
  act(() => result.current.setProvider('flowcept'));
  await waitFor(() => expect(result.current.execution.data?.provider).toBe('flowcept'));
  expect(read).toHaveBeenLastCalledWith(
    'session',
    expect.objectContaining({ provider: 'flowcept' }),
    expect.any(AbortSignal),
  );
  client.clear();
});
