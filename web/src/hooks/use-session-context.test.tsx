import {
  ClioRepository,
  type ClioTransport,
  type TransportFrame,
  type TransportRequest,
} from '@clio/core/v3';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { act, renderHook, waitFor } from '@testing-library/react';
import type { ReactNode } from 'react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { useLiveStore } from '@/store/live-store';

/** The network boundary: records every request and answers like the service. */
class RecordingTransport implements ClioTransport {
  public readonly requests: TransportRequest<unknown>[] = [];

  public async request<T>(request: TransportRequest<T>): Promise<T> {
    this.requests.push(request as TransportRequest<unknown>);
    if (request.path.includes('/compact')) {
      return request.decode({ session_id: 'sess 1', compacted: true });
    }
    return request.decode({ session_id: 'sess 1', scope: 'expert/main', live_tokens: 10 });
  }

  public async *stream(): AsyncIterable<never> {}
}

const transport = vi.hoisted(() => ({ current: undefined as unknown }));

vi.mock('@/providers/connection-provider', () => ({
  useConnectionSettings: () => ({ settings: { endpoint: 'http://127.0.0.1:8790' } }),
}));
vi.mock('./use-repository', () => ({
  useRepository: () => transport.current,
}));

import { useSessionContext } from './use-session-context';

function wrapper({ children }: { children: ReactNode }) {
  const client = new QueryClient({
    defaultOptions: { mutations: { retry: false }, queries: { retry: false } },
  });
  return <QueryClientProvider client={client}>{children}</QueryClientProvider>;
}

function compactionFrame(type: string, payload: unknown): TransportFrame {
  return {
    cursor: '1',
    eventName: type,
    receivedAt: '2026-10-01T12:00:00Z',
    data: {
      protocol_version: '0.3',
      type,
      occurred_at: '2026-10-01T12:00:00Z',
      scope: { connection_id: 'local', session_id: 'sess 1' },
      payload,
    },
  };
}

afterEach(() => {
  useLiveStore.getState().reset();
});

describe('useSessionContext compaction', () => {
  it("compacts the panel's selected scope through the session compact route", async () => {
    const recording = new RecordingTransport();
    transport.current = new ClioRepository(recording);
    const { result } = renderHook(() => useSessionContext('sess 1', 'expert/main'), { wrapper });

    await act(async () => {
      await result.current.compact.mutateAsync();
    });

    const compactRequests = recording.requests.filter((request) => request.method === 'POST');
    expect(compactRequests.map(({ method, path }) => ({ method, path }))).toEqual([
      { method: 'POST', path: '/v1/sessions/sess%201/compact?scope=expert%2Fmain' },
    ]);
    expect(recording.requests.some((request) => request.path.includes('/context/compact'))).toBe(
      false,
    );
  });

  it('stays pending while the live stream reports a running compaction', async () => {
    transport.current = new ClioRepository(new RecordingTransport());
    const { result } = renderHook(() => useSessionContext('sess 1', 'expert/main'), { wrapper });
    expect(result.current.compactPending).toBe(false);

    const event = {
      session_id: 'sess 1',
      compaction_id: 'cmp_1',
      scope: 'expert/main',
      trigger: 'manual',
      turn_id: '',
    };
    act(() => useLiveStore.getState().applyFrames([compactionFrame('compaction.started', event)]));
    await waitFor(() => expect(result.current.compactPending).toBe(true));

    act(() =>
      useLiveStore.getState().applyFrames([
        {
          ...compactionFrame('compaction.failed', {
            ...event,
            error: { code: 'compaction_unavailable', message: 'No model is bound.' },
          }),
          cursor: '2',
        },
      ]),
    );
    await waitFor(() => expect(result.current.compactPending).toBe(false));
  });
});
