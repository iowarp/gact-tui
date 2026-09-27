import type { AttentionResult } from '@clio/core/v3';
import { act, renderHook, waitFor } from '@testing-library/react';
import type { ReactNode } from 'react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { SelectionActionsProvider } from '@/components/clio/selection-actions';
import { useSelectionActionRegistry } from './use-selection-action';
import { useAttentionMode } from './use-attention-mode';

const mocks = vi.hoisted(() => ({
  getAttention: vi.fn<(...args: unknown[]) => Promise<AttentionResult>>(),
}));

vi.mock('./use-repository', () => ({
  useRepository: () => ({ getAttention: mocks.getAttention }),
}));

afterEach(() => {
  mocks.getAttention.mockReset();
});

const selection = { kind: 'agent-answer-text' as const, text: 'confirmed columns', sessionId: 'sess_1', messageId: 'msg_1' };

function wrapper({ children }: { children: ReactNode }) {
  return <SelectionActionsProvider>{children}</SelectionActionsProvider>;
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
  it('starts idle and registers the understand-attention selection action', () => {
    const { result } = renderHook(
      () => {
        const attention = useAttentionMode('sess_1');
        const registry = useSelectionActionRegistry();
        return { attention, registry };
      },
      { wrapper },
    );
    expect(result.current.attention.state).toEqual({ status: 'idle' });
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
        const attention = useAttentionMode('sess_1');
        const registry = useSelectionActionRegistry();
        return { attention, registry };
      },
      { wrapper },
    );
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
    mocks.getAttention.mockResolvedValue({ available: false, message: 'No attention for this model.' });
    const { result } = renderHook(
      () => {
        const attention = useAttentionMode('sess_1');
        const registry = useSelectionActionRegistry();
        return { attention, registry };
      },
      { wrapper },
    );
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
    const { result } = renderHook(() => {
      const attention = useAttentionMode('sess_1');
      const registry = useSelectionActionRegistry();
      return { attention, registry };
    }, { wrapper });
    act(() => {
      result.current.registry.actionsFor(selection)[0]?.run(selection);
    });
    await waitFor(() => expect(result.current.attention.state.status).toBe('idle'));
  });

  it('dismiss resets to idle', async () => {
    mocks.getAttention.mockResolvedValue(available);
    const { result } = renderHook(() => {
      const attention = useAttentionMode('sess_1');
      const registry = useSelectionActionRegistry();
      return { attention, registry };
    }, { wrapper });
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
        const attention = useAttentionMode(sessionId);
        const registry = useSelectionActionRegistry();
        return { attention, registry };
      },
      { wrapper, initialProps: { sessionId: 'sess_1' } },
    );
    act(() => {
      result.current.registry.actionsFor(selection)[0]?.run(selection);
    });
    await waitFor(() => expect(result.current.attention.state.status).toBe('shown'));
    rerender({ sessionId: 'sess_2' });
    expect(result.current.attention.state).toEqual({ status: 'idle' });
  });

  it('registers after More details in toolbar order', () => {
    const { result } = renderHook(
      () => {
        const attention = useAttentionMode('sess_1');
        const registry = useSelectionActionRegistry();
        return { attention, registry };
      },
      { wrapper },
    );
    const moreDetailsOrder = 20; // hooks/use-more-details.ts
    const action = result.current.registry.actionsFor(selection).find((a) => a.id === 'understand-attention');
    expect(action?.order).toBeGreaterThan(moreDetailsOrder);
  });

  it('only offers the action for the session it was opened on', () => {
    const { result } = renderHook(
      () => {
        const attention = useAttentionMode('sess_1');
        const registry = useSelectionActionRegistry();
        return { attention, registry };
      },
      { wrapper },
    );
    const otherSessionSelection = { ...selection, sessionId: 'sess_other' };
    expect(result.current.registry.actionsFor(otherSessionSelection)).toEqual([]);
  });
});
