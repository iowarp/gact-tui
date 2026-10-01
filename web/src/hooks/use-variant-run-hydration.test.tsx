import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { renderHook, waitFor } from '@testing-library/react';
import type { ReactNode } from 'react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { useLiveStore } from '@/store/live-store';
import reloadFixture from '@/test-fixtures/variant-runs/refine-user-judged-reload.json';

const mocks = vi.hoisted(() => ({
  repository: {
    variantTrace: vi.fn(),
    questions: vi.fn(),
  },
}));

vi.mock('@/providers/connection-provider', () => ({
  useConnectionSettings: () => ({ settings: { endpoint: 'http://127.0.0.1:8790' } }),
}));
vi.mock('./use-repository', () => ({ useRepository: () => mocks.repository }));

import { useVariantRunHydration } from './use-variant-run-hydration';

function wrapper({ children }: { children: ReactNode }) {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  return <QueryClientProvider client={client}>{children}</QueryClientProvider>;
}

beforeEach(() => {
  useLiveStore.getState().reset();
  mocks.repository.variantTrace.mockReset();
  mocks.repository.questions.mockReset();
});

describe('useVariantRunHydration', () => {
  it('rebuilds the session variant runs from the trace and the questions', async () => {
    mocks.repository.variantTrace.mockResolvedValue({
      status: 'available',
      events: reloadFixture.trace.events,
    });
    mocks.repository.questions.mockResolvedValue(reloadFixture.questions);
    renderHook(() => useVariantRunHydration({ enabled: true, sessionId: 'sess_drafts' }), {
      wrapper,
    });

    await waitFor(() =>
      expect(useLiveStore.getState().entities.variant_runs.var_9?.selection?.selected_index).toBe(
        2,
      ),
    );
    const run = useLiveStore.getState().entities.variant_runs.var_9!;
    expect(run.run_id).toBe('turn_1');
    expect(run.tries.map((item) => item.try_index)).toEqual([0, 1, 2]);
    expect(mocks.repository.variantTrace).toHaveBeenCalledWith('sess_drafts', expect.anything());
  });

  it('still rebuilds every pick question when the deployment keeps no trace', async () => {
    mocks.repository.variantTrace.mockResolvedValue({
      status: 'unavailable',
      reason: 'ARC memory is not enabled for this deployment',
    });
    mocks.repository.questions.mockResolvedValue(reloadFixture.questions);
    renderHook(() => useVariantRunHydration({ enabled: true, sessionId: 'sess_drafts' }), {
      wrapper,
    });

    await waitFor(() =>
      expect(useLiveStore.getState().entities.variant_runs.var_9?.tries).toHaveLength(3),
    );
    const run = useLiveStore.getState().entities.variant_runs.var_9!;
    expect(run.questions.map((question) => question.id)).toEqual(['q_round1', 'q_round2']);
    expect(run.tries[2]?.text).toContain('0.6M, 1.2M, 2.1M cells');
  });

  it('waits until enabled', () => {
    renderHook(() => useVariantRunHydration({ enabled: false, sessionId: 'sess_drafts' }), {
      wrapper,
    });
    expect(mocks.repository.variantTrace).not.toHaveBeenCalled();
  });
});
