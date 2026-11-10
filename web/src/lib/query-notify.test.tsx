import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { act, renderHook, waitFor } from '@testing-library/react';
import type { ReactNode } from 'react';
import { describe, expect, it } from 'vitest';
import { useQueryFetching } from './query-notify';

describe('useQueryFetching', () => {
  it('follows a cached query through a background fetch', async () => {
    const client = new QueryClient();
    client.setQueryData(['transcript', 'sess_1'], { messages: [] });
    const wrapper = ({ children }: { children: ReactNode }) => (
      <QueryClientProvider client={client}>{children}</QueryClientProvider>
    );
    const { result } = renderHook(() => useQueryFetching(['transcript', 'sess_1']), { wrapper });
    expect(result.current).toBe(false);

    let finish!: () => void;
    act(() => {
      void client.fetchQuery({
        queryKey: ['transcript', 'sess_1'],
        queryFn: () =>
          new Promise<{ messages: [] }>((resolve) => (finish = () => resolve({ messages: [] }))),
      });
    });
    await waitFor(() => expect(result.current).toBe(true));
    act(() => finish());
    await waitFor(() => expect(result.current).toBe(false));
  });

  it('ignores other queries, a disabled read and a missing query client', async () => {
    const client = new QueryClient();
    const wrapper = ({ children }: { children: ReactNode }) => (
      <QueryClientProvider client={client}>{children}</QueryClientProvider>
    );
    const { result } = renderHook(
      () => [useQueryFetching(['transcript', 'sess_1']), useQueryFetching(['files'], false)],
      { wrapper },
    );
    act(() => {
      void client.fetchQuery({ queryKey: ['other'], queryFn: () => new Promise(() => {}) });
      void client.fetchQuery({ queryKey: ['files'], queryFn: () => new Promise(() => {}) });
    });
    expect(result.current).toEqual([false, false]);

    expect(renderHook(() => useQueryFetching(['transcript'])).result.current).toBe(false);
  });
});
