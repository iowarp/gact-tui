import { act, renderHook, waitFor } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';

const mocks = vi.hoisted(() => {
  const repository = {
    stream: vi.fn(),
  };
  const storeState = {
    entities: { cursor: undefined, stream: 'offline' },
    error: undefined,
    applyFrames: vi.fn(),
    reconcileSnapshots: vi.fn(),
    setStreamError: vi.fn(),
    setStreamState: vi.fn(),
  };
  const useLiveStore = Object.assign(
    vi.fn((selector: (state: typeof storeState) => unknown) => selector(storeState)),
    { getState: vi.fn(() => storeState) },
  );
  return {
    queryClient: { invalidateQueries: vi.fn(async () => undefined), setQueryData: vi.fn() },
    repository,
    resume: undefined as (() => void) | undefined,
    storeState,
    useLiveStore,
  };
});

vi.mock('@tanstack/react-query', () => ({ useQueryClient: () => mocks.queryClient }));
vi.mock('@/providers/connection-provider', () => ({
  useConnectionSettings: () => ({ settings: { endpoint: 'http://127.0.0.1:8790' } }),
}));
vi.mock('@/store/live-store', () => ({ useLiveStore: mocks.useLiveStore }));
vi.mock('./use-repository', () => ({ useRepository: () => mocks.repository }));
vi.mock('@/lib/streaming/frame-batcher', () => ({
  FrameBatcher: class {
    flush() {}
    push() {}
    stop() {}
  },
}));
vi.mock('@/tauri/desktop-lifecycle', () => ({
  listenForDesktopResume: vi.fn(async (onResume: () => void) => {
    mocks.resume = onResume;
    return vi.fn();
  }),
}));

import { queryInvalidationKeysForEvent, useSessionLiveStream } from './use-session-live-stream';

describe('useSessionLiveStream resume recovery', () => {
  beforeEach(() => {
    vi.spyOn(document, 'hasFocus').mockReturnValue(true);
    mocks.repository.stream.mockReset();
    mocks.queryClient.invalidateQueries.mockReset();
    mocks.queryClient.invalidateQueries.mockResolvedValue(undefined);
    mocks.resume = undefined;
    mocks.storeState.setStreamState.mockReset();
    mocks.repository.stream.mockImplementation(async function* (
      _scope: unknown,
      _cursor: unknown,
      signal: AbortSignal,
    ) {
      await new Promise<void>((resolve) => {
        if (signal.aborted) resolve();
        else signal.addEventListener('abort', () => resolve(), { once: true });
      });
      if (!signal.aborted) yield undefined;
    });
  });

  it('reopens the cursor-aware stream when the desktop resumes', async () => {
    const { unmount } = renderHook(() =>
      useSessionLiveStream({
        enabled: true,
        initialCursor: '42',
        sessionId: 'sess_1',
        workspaceId: 'ws_1',
      }),
    );

    await waitFor(() => expect(mocks.repository.stream).toHaveBeenCalledTimes(1));
    await waitFor(() => expect(mocks.resume).toBeTypeOf('function'));
    act(() => mocks.resume?.());
    await waitFor(() => expect(mocks.repository.stream).toHaveBeenCalledTimes(2));

    expect(mocks.repository.stream).toHaveBeenLastCalledWith(
      { connection_id: 'active', workspace_id: 'ws_1', session_id: 'sess_1' },
      '42',
      expect.any(AbortSignal),
    );
    unmount();
  });

  it('maps process events to process and session snapshots', () => {
    expect(
      queryInvalidationKeysForEvent({
        endpoint: 'http://127.0.0.1:8790',
        eventName: 'agent.task.completed',
        sessionId: 'sess_1',
        workspaceId: 'ws_1',
      }),
    ).toEqual([
      ['session-observability', 'http://127.0.0.1:8790', 'sess_1', 'processes'],
      ['sessions', 'http://127.0.0.1:8790', 'all'],
    ]);
  });

  it('does not refetch the complete transcript after an ordered completion event', () => {
    const keys = queryInvalidationKeysForEvent({
      endpoint: 'http://127.0.0.1:8790',
      eventName: 'message.completed',
      sessionId: 'sess_1',
      workspaceId: 'ws_1',
    });

    expect(keys).not.toContainEqual(['transcript', 'http://127.0.0.1:8790', 'sess_1']);
    expect(keys).toContainEqual(['sessions', 'http://127.0.0.1:8790', 'ws_1']);
  });

  it('invalidates the approvals query the workspace actually reads', async () => {
    const { QueryClient } = await vi.importActual<typeof import('@tanstack/react-query')>(
      '@tanstack/react-query',
    );
    const client = new QueryClient();
    client.setQueryData(['pending-approvals', 'http://127.0.0.1:8790', 'all-active'], []);

    const matched = queryInvalidationKeysForEvent({
      endpoint: 'http://127.0.0.1:8790',
      eventName: 'permission.requested',
      sessionId: 'sess_1',
      workspaceId: 'ws_1',
    }).flatMap((queryKey) =>
      client
        .getQueryCache()
        .findAll({ queryKey })
        .map((query) => query.queryKey),
    );

    expect(matched).toContainEqual(['pending-approvals', 'http://127.0.0.1:8790', 'all-active']);
  });

  it('continues consuming frames while cache invalidation is unresolved', async () => {
    let advancedPastFirstFrame = false;
    mocks.queryClient.invalidateQueries.mockImplementation(() => new Promise(() => undefined));
    mocks.repository.stream.mockImplementation(async function* (
      _scope: unknown,
      _cursor: unknown,
      signal: AbortSignal,
    ) {
      yield { eventName: 'permission.requested' };
      advancedPastFirstFrame = true;
      await new Promise<void>((resolve) => {
        if (signal.aborted) resolve();
        else signal.addEventListener('abort', () => resolve(), { once: true });
      });
    });

    const { unmount } = renderHook(() =>
      useSessionLiveStream({
        enabled: true,
        sessionId: 'sess_1',
        workspaceId: 'ws_1',
      }),
    );

    await waitFor(() => expect(mocks.queryClient.invalidateQueries).toHaveBeenCalled());
    expect(advancedPastFirstFrame).toBe(true);
    unmount();
  });
});
