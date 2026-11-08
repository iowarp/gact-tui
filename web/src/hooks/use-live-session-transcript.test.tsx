import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { act, cleanup, renderHook, waitFor } from '@testing-library/react';
import type { PropsWithChildren } from 'react';
import { afterEach, expect, it, vi } from 'vitest';
import { useLiveSessionTranscript } from './use-live-session-transcript';

const { transcript, stream } = vi.hoisted(() => ({ transcript: vi.fn(), stream: vi.fn() }));
vi.mock('@/providers/connection-provider', () => ({
  useConnectionSettings: () => ({ settings: { endpoint: 'http://child.test' } }),
}));
vi.mock('./use-repository', () => ({ useRepository: () => ({ transcript, stream }) }));
afterEach(() => {
  cleanup();
  vi.clearAllMocks();
});

const message = (id: string, minute: number) => ({
  id,
  session_id: 'child',
  role: 'assistant',
  created_at: `2026-10-01T12:${String(minute).padStart(2, '0')}:00Z`,
  blocks: [],
});
const page = (messages: ReturnType<typeof message>[], next_cursor?: string) => ({
  cursor: 'c1',
  next_cursor,
  messages,
  tools: [],
  tasks: [],
  subagents: [],
  artifacts: [],
  surfaces: [],
});

it('reads the newest page, then older pages only on request', async () => {
  stream.mockImplementation(async function* (
    _scope: unknown,
    _cursor: unknown,
    signal: AbortSignal,
  ) {
    await new Promise((resolve) => signal.addEventListener('abort', resolve));
    yield* [];
  });
  transcript.mockImplementation(
    async (_id: string, _signal: unknown, options?: { before?: string }) =>
      options?.before === 'm3'
        ? page([message('m1', 1), message('m2', 2)])
        : page([message('m3', 3), message('m4', 4)], 'm3'),
  );
  const client = new QueryClient({ defaultOptions: { queries: { retry: false, gcTime: 0 } } });
  const wrapper = ({ children }: PropsWithChildren) => (
    <QueryClientProvider client={client}>{children}</QueryClientProvider>
  );
  const { result } = renderHook(() => useLiveSessionTranscript('ws', 'child', 'canvas'), {
    wrapper,
  });
  await waitFor(() => expect(result.current.messages.map((item) => item.id)).toEqual(['m3', 'm4']));
  expect(transcript).toHaveBeenCalledTimes(1);
  expect(transcript.mock.calls[0]?.[2]).toEqual({ limit: 40 });
  expect(result.current.earlier?.hasEarlier).toBe(true);

  act(() => result.current.earlier?.load());
  await waitFor(() =>
    expect(result.current.messages.map((item) => item.id)).toEqual(['m1', 'm2', 'm3', 'm4']),
  );
  expect(transcript.mock.calls[1]?.[2]).toEqual({ limit: 40, before: 'm3' });
  expect(result.current.earlier?.hasEarlier).toBe(false);
  client.clear();
});

it('offers no earlier control when the first page is the whole conversation', async () => {
  stream.mockImplementation(async function* (
    _scope: unknown,
    _cursor: unknown,
    signal: AbortSignal,
  ) {
    await new Promise((resolve) => signal.addEventListener('abort', resolve));
    yield* [];
  });
  transcript.mockResolvedValue(page([message('m1', 1)]));
  const client = new QueryClient({ defaultOptions: { queries: { retry: false, gcTime: 0 } } });
  const wrapper = ({ children }: PropsWithChildren) => (
    <QueryClientProvider client={client}>{children}</QueryClientProvider>
  );
  const { result } = renderHook(() => useLiveSessionTranscript('ws', 'child', 'aside'), {
    wrapper,
  });
  await waitFor(() => expect(result.current.messages).toHaveLength(1));
  expect(result.current.earlier).toBeUndefined();
  client.clear();
});
