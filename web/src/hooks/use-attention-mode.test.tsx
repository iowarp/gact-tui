import type { AttentionResult, AttentionSessionAvailability } from '@clio/core/v3';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { act, renderHook, waitFor } from '@testing-library/react';
import type { ReactNode } from 'react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { SelectionActionsProvider } from '@/components/clio/selection-actions';
import { useSelectionActionRegistry } from './use-selection-action';
import { useAttentionMode } from './use-attention-mode';

const mocks = vi.hoisted(() => ({
  endpoint: 'http://attention-clio:8100',
  getAttention: vi.fn<(...args: unknown[]) => Promise<AttentionResult>>(),
  attentionAvailability: vi.fn<(...args: unknown[]) => Promise<AttentionSessionAvailability>>(),
}));

vi.mock('./use-repository', () => ({
  useRepository: () => ({
    getAttention: mocks.getAttention,
    attentionAvailability: mocks.attentionAvailability,
  }),
}));

vi.mock('@/providers/connection-provider', () => ({
  useConnectionSettings: () => ({ settings: { endpoint: mocks.endpoint } }),
}));

let queryClient: QueryClient;
beforeEach(() => {
  mocks.endpoint = 'http://attention-clio:8100';
  queryClient = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  mocks.attentionAvailability.mockResolvedValue({ enabled: true, messages: { msg_1: true } });
});

afterEach(() => {
  mocks.getAttention.mockReset();
  mocks.attentionAvailability.mockReset();
});

const selection = {
  kind: 'agent-answer-text' as const,
  text: 'confirmed columns',
  sessionId: 'sess_1',
  messageId: 'msg_1',
};

function wrapper({ children }: { children: ReactNode }) {
  return (
    <QueryClientProvider client={queryClient}>
      <SelectionActionsProvider>{children}</SelectionActionsProvider>
    </QueryClientProvider>
  );
}

/** The action appears once the session's availability has loaded. */
async function offered(result: {
  current: { registry: { actionsFor: (t: typeof selection) => unknown[] } };
}) {
  await waitFor(() =>
    expect(result.current.registry.actionsFor(selection).length).toBeGreaterThan(0),
  );
}

const available: AttentionResult = {
  available: true,
  message_id: 'msg_1',
  selection: { text: 'confirmed columns' },
  residual: 0.7,
  sources: [{ domain: 'tool_result', share: 0.2 }],
  flags: [],
  blocks: [],
};

describe('useAttentionMode', () => {
  it('recomputes the same selection with an explicitly chosen profile', async () => {
    mocks.getAttention.mockResolvedValue(available);
    const { result } = renderHook(
      () => {
        const attention = useAttentionMode('sess_1', 0);
        return { attention, registry: useSelectionActionRegistry() };
      },
      { wrapper },
    );
    await offered(result);
    act(() => result.current.registry.actionsFor(selection)[0]?.run(selection));
    await waitFor(() => expect(result.current.attention.state.status).toBe('shown'));
    act(() =>
      result.current.attention.changeProfile({
        name: 'custom',
        decay_base: 0.3,
        weighting: 'exponential',
      }),
    );
    await waitFor(() => expect(mocks.getAttention).toHaveBeenCalledTimes(2));
    expect(mocks.getAttention.mock.calls[1]?.[2]).toEqual({
      text: selection.text,
      profile: { name: 'custom', decay_base: 0.3, weighting: 'exponential' },
    });
  });

  it('cannot apply an old host response after switching to the same session ID on another host', async () => {
    let resolve: (value: AttentionResult) => void = () => undefined;
    mocks.getAttention.mockReturnValue(
      new Promise((done) => {
        resolve = done;
      }),
    );
    const { result, rerender } = renderHook(
      () => {
        const attention = useAttentionMode('sess_1', 0);
        return { attention, registry: useSelectionActionRegistry() };
      },
      { wrapper },
    );
    await offered(result);
    act(() => result.current.registry.actionsFor(selection)[0]?.run(selection));
    mocks.endpoint = 'http://different-clio:8100';
    rerender();
    expect(result.current.attention.state.status).toBe('idle');
    await act(async () => {
      resolve(available);
      await Promise.resolve();
    });
    expect(result.current.attention.state.status).toBe('idle');
    await waitFor(() => expect(mocks.attentionAvailability).toHaveBeenCalledTimes(2));
    expect((mocks.getAttention.mock.calls[0]?.[3] as AbortSignal).aborted).toBe(true);
  });
  it('starts idle and registers the understand-attention selection action', async () => {
    const { result } = renderHook(
      () => {
        const attention = useAttentionMode('sess_1', 0);
        const registry = useSelectionActionRegistry();
        return { attention, registry };
      },
      { wrapper },
    );
    expect(result.current.attention.state).toEqual({ status: 'idle' });
    await offered(result);
    const actions = result.current.registry.actionsFor(selection);
    expect(actions.map((a) => a.id)).toContain('understand-attention');
  });

  it('goes loading then shown on an available result', async () => {
    let resolve: (value: AttentionResult) => void = () => undefined;
    mocks.getAttention.mockReturnValue(
      new Promise((r) => {
        resolve = r;
      }),
    );
    const { result } = renderHook(
      () => {
        const attention = useAttentionMode('sess_1', 0);
        const registry = useSelectionActionRegistry();
        return { attention, registry };
      },
      { wrapper },
    );
    await offered(result);
    act(() => {
      result.current.registry.actionsFor(selection)[0]?.run(selection);
    });
    expect(result.current.attention.state.status).toBe('loading');
    await act(async () => {
      resolve(available);
      await Promise.resolve();
    });
    await waitFor(() => expect(result.current.attention.state.status).toBe('shown'));
    expect(result.current.attention.state).toMatchObject({ status: 'shown', data: available });
  });

  it('goes to unavailable with the server message when available is false', async () => {
    mocks.getAttention.mockResolvedValue({
      available: false,
      message: 'No attention for this model.',
    });
    const { result } = renderHook(
      () => {
        const attention = useAttentionMode('sess_1', 0);
        const registry = useSelectionActionRegistry();
        return { attention, registry };
      },
      { wrapper },
    );
    await offered(result);
    act(() => {
      result.current.registry.actionsFor(selection)[0]?.run(selection);
    });
    await waitFor(() => expect(result.current.attention.state.status).toBe('unavailable'));
    expect(result.current.attention.state).toMatchObject({
      status: 'unavailable',
      message: 'No attention for this model.',
    });
  });

  it('resets to idle on a transport failure', async () => {
    mocks.getAttention.mockRejectedValue(new Error('network down'));
    const { result } = renderHook(
      () => {
        const attention = useAttentionMode('sess_1', 0);
        const registry = useSelectionActionRegistry();
        return { attention, registry };
      },
      { wrapper },
    );
    await offered(result);
    act(() => {
      result.current.registry.actionsFor(selection)[0]?.run(selection);
    });
    await waitFor(() => expect(result.current.attention.state.status).toBe('idle'));
  });

  it('dismiss resets to idle', async () => {
    mocks.getAttention.mockResolvedValue(available);
    const { result } = renderHook(
      () => {
        const attention = useAttentionMode('sess_1', 0);
        const registry = useSelectionActionRegistry();
        return { attention, registry };
      },
      { wrapper },
    );
    await offered(result);
    act(() => {
      result.current.registry.actionsFor(selection)[0]?.run(selection);
    });
    await waitFor(() => expect(result.current.attention.state.status).toBe('shown'));
    act(() => result.current.attention.dismiss());
    expect(result.current.attention.state).toEqual({ status: 'idle' });
  });

  it('reads as idle again once the session id changes', async () => {
    mocks.getAttention.mockResolvedValue(available);
    const { result, rerender } = renderHook(
      ({ sessionId }: { sessionId: string }) => {
        const attention = useAttentionMode(sessionId, 0);
        const registry = useSelectionActionRegistry();
        return { attention, registry };
      },
      { wrapper, initialProps: { sessionId: 'sess_1' } },
    );
    await offered(result);
    act(() => {
      result.current.registry.actionsFor(selection)[0]?.run(selection);
    });
    await waitFor(() => expect(result.current.attention.state.status).toBe('shown'));
    rerender({ sessionId: 'sess_2' });
    expect(result.current.attention.state).toEqual({ status: 'idle' });
  });

  it('registers after More details in toolbar order', async () => {
    const { result } = renderHook(
      () => {
        const attention = useAttentionMode('sess_1', 0);
        const registry = useSelectionActionRegistry();
        return { attention, registry };
      },
      { wrapper },
    );
    await offered(result);
    const moreDetailsOrder = 20; // hooks/use-more-details.ts
    const action = result.current.registry
      .actionsFor(selection)
      .find((a) => a.id === 'understand-attention');
    expect(action?.order).toBeGreaterThan(moreDetailsOrder);
  });

  it('only offers the action for the session it was opened on', () => {
    const { result } = renderHook(
      () => {
        const attention = useAttentionMode('sess_1', 0);
        const registry = useSelectionActionRegistry();
        return { attention, registry };
      },
      { wrapper },
    );
    const otherSessionSelection = { ...selection, sessionId: 'sess_other' };
    expect(result.current.registry.actionsFor(otherSessionSelection)).toEqual([]);
  });

  it('never offers the action when the session has no attention capture', async () => {
    mocks.attentionAvailability.mockResolvedValue({
      enabled: false,
      reason: 'attention_disabled',
      messages: {},
    });
    const { result } = renderHook(
      () => {
        const attention = useAttentionMode('sess_1', 0);
        const registry = useSelectionActionRegistry();
        return { attention, registry };
      },
      { wrapper },
    );
    await waitFor(() => expect(mocks.attentionAvailability).toHaveBeenCalled());
    await act(async () => {
      await Promise.resolve();
    });
    expect(result.current.registry.actionsFor(selection)).toEqual([]);
  });

  it('offers the action only on answers the service marks available', async () => {
    mocks.attentionAvailability.mockResolvedValue({
      enabled: true,
      messages: { msg_1: true, msg_2: false },
    });
    const { result } = renderHook(
      () => {
        const attention = useAttentionMode('sess_1', 0);
        const registry = useSelectionActionRegistry();
        return { attention, registry };
      },
      { wrapper },
    );
    await offered(result);
    expect(result.current.registry.actionsFor({ ...selection, messageId: 'msg_2' })).toEqual([]);
    expect(result.current.registry.actionsFor({ ...selection, messageId: 'msg_new' })).toEqual([]);
  });

  it('re-checks availability when the transcript grows', async () => {
    const { rerender } = renderHook(
      ({ revision }: { revision: number }) => useAttentionMode('sess_1', revision),
      { wrapper, initialProps: { revision: 1 } },
    );
    await waitFor(() => expect(mocks.attentionAvailability).toHaveBeenCalledTimes(1));
    rerender({ revision: 2 });
    await waitFor(() => expect(mocks.attentionAvailability).toHaveBeenCalledTimes(2));
  });
});
