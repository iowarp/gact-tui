import {
  ClioRepository,
  TransportError,
  type ClioTransport,
  type TransportRequest,
} from '@clio/core/v3';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { renderHook, waitFor } from '@testing-library/react';
import type { ReactNode } from 'react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { useLiveStore } from '@/store/live-store';
import reloadFixture from '@/test-fixtures/variant-runs/refine-user-judged-reload.json';

/** The real repository over a transport that answers the one variant-runs read. */
const mocks = vi.hoisted(() => ({
  respond: { current: (): unknown => undefined },
  requests: [] as string[],
  toastError: vi.fn(),
}));

function repositoryAnswering(): ClioRepository {
  const transport: ClioTransport = {
    request<T>(request: TransportRequest<T>): Promise<T> {
      mocks.requests.push(request.path);
      try {
        return Promise.resolve(request.decode(mocks.respond.current()));
      } catch (error) {
        return Promise.reject(error instanceof Error ? error : new Error(String(error)));
      }
    },
    // oxlint-disable-next-line require-yield
    async *stream() {
      return;
    },
  };
  return new ClioRepository(transport);
}

const repository = repositoryAnswering();

vi.mock('@/providers/connection-provider', () => ({
  useConnectionSettings: () => ({ settings: { endpoint: 'http://127.0.0.1:8790' } }),
}));
vi.mock('./use-repository', () => ({ useRepository: () => repository }));
vi.mock('sonner', () => ({ toast: { error: mocks.toastError } }));

import { useVariantRunHydration } from './use-variant-run-hydration';

function wrapper({ children }: { children: ReactNode }) {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  return <QueryClientProvider client={client}>{children}</QueryClientProvider>;
}

beforeEach(() => {
  useLiveStore.getState().reset();
  mocks.requests.length = 0;
  mocks.toastError.mockReset();
});

describe('useVariantRunHydration', () => {
  it('rebuilds the session variant runs from the runs clio-core serves', async () => {
    mocks.respond.current = () => reloadFixture.variant_runs;
    renderHook(() => useVariantRunHydration({ enabled: true, sessionId: 'sess_drafts' }), {
      wrapper,
    });

    await waitFor(() =>
      expect(useLiveStore.getState().entities.variant_runs.var_9?.selection?.selected_index).toBe(
        2,
      ),
    );
    const run = useLiveStore.getState().entities.variant_runs.var_9!;
    expect(run).toMatchObject({ run_id: 'msg_user_1', anchor_message_id: 'msg_assistant_1' });
    expect(run.tries.map((item) => item.try_index)).toEqual([0, 1, 2]);
    expect(run.tries[0]!.steps).toHaveLength(3);
    expect(mocks.requests).toEqual(['/v1/sessions/sess_drafts/variant-runs']);
  });

  it('says when the runs cannot be read', async () => {
    mocks.respond.current = () => {
      throw new TransportError(
        'variant record seg_9 is unreadable',
        500,
        'variant_record_unreadable',
      );
    };
    renderHook(() => useVariantRunHydration({ enabled: true, sessionId: 'sess_drafts' }), {
      wrapper,
    });
    await waitFor(() =>
      expect(mocks.toastError).toHaveBeenCalledWith('Earlier drafts could not be loaded', {
        id: 'variant-runs:sess_drafts',
        description: 'variant record seg_9 is unreadable',
      }),
    );
    expect(useLiveStore.getState().entities.variant_runs).toEqual({});
  });

  it('waits until enabled', () => {
    renderHook(() => useVariantRunHydration({ enabled: false, sessionId: 'sess_drafts' }), {
      wrapper,
    });
    expect(mocks.requests).toEqual([]);
  });
});
