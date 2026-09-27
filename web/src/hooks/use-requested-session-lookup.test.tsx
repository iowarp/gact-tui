import { QueryClient, QueryClientProvider, useQuery } from '@tanstack/react-query';
import { act, renderHook, waitFor } from '@testing-library/react';
import type { ReactNode } from 'react';
import { describe, expect, it, vi } from 'vitest';
import { useRequestedSessionLookup } from './use-requested-session-lookup';

function setup(listed: string[]) {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  const fetchSessions = vi.fn(async () => listed.map((id) => ({ id })));
  let renders = 0;
  const hook = renderHook(
    ({ sessionId }: { sessionId: string }) => {
      renders += 1;
      const sessions = useQuery({ queryKey: ['sessions'], queryFn: fetchSessions });
      const found = Boolean(sessions.data?.some((item) => item.id === sessionId));
      return useRequestedSessionLookup(sessionId, found, sessions);
    },
    {
      initialProps: { sessionId: 'sess_1' },
      wrapper: ({ children }: { children: ReactNode }) => (
        <QueryClientProvider client={client}>{children}</QueryClientProvider>
      ),
    },
  );
  return { client, fetchSessions, hook, renders: () => renders };
}

describe('useRequestedSessionLookup', () => {
  it('does not re-render its consumer when a found session list is refetched unchanged', async () => {
    const { client, fetchSessions, hook, renders } = setup(['sess_1']);
    await waitFor(() => expect(client.isFetching()).toBe(0));
    expect(hook.result.current).toBe(false);
    const settled = renders();

    // A background poll of the same list: fetchStatus flips and dataUpdatedAt
    // advances, neither of which this hook needs while the session is found.
    await act(async () => {
      await client.refetchQueries({ queryKey: ['sessions'] });
      // Query notifications are delivered on a later macrotask.
      await new Promise((resolve) => setTimeout(resolve, 20));
    });

    expect(fetchSessions).toHaveBeenCalledTimes(2);
    expect(renders()).toBe(settled);
  });

  it('still confirms a missing session with one refetch before calling it unavailable', async () => {
    const { client, fetchSessions, hook } = setup(['sess_other']);
    await waitFor(() => expect(fetchSessions).toHaveBeenCalledTimes(2));
    await waitFor(() => expect(client.isFetching()).toBe(0));
    expect(hook.result.current).toBe(false);
  });
});
