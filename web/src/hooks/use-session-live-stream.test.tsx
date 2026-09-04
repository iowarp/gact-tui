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
    toast: { error: vi.fn(), info: vi.fn(), success: vi.fn() },
    useLiveStore,
  };
});

vi.mock('@tanstack/react-query', () => ({ useQueryClient: () => mocks.queryClient }));
vi.mock('sonner', () => ({ toast: mocks.toast }));
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
    mocks.toast.error.mockReset();
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

  it('refreshes the reads each resource event actually changes', () => {
    const forEvent = (eventName: string) =>
      queryInvalidationKeysForEvent({
        endpoint: 'http://127.0.0.1:8790',
        eventName,
        sessionId: 'sess_1',
        workspaceId: 'ws_1',
      });

    const completed = forEvent('resource.processing_completed');
    expect(completed).toContainEqual([
      'workspace-resource-derivatives',
      'http://127.0.0.1:8790',
      'ws_1',
    ]);
    expect(completed).toContainEqual([
      'workspace-resource-structure',
      'http://127.0.0.1:8790',
      'ws_1',
    ]);
    expect(forEvent('resource.processing_failed')).toContainEqual([
      'workspace-resource-derivatives',
      'http://127.0.0.1:8790',
      'ws_1',
    ]);
    expect(forEvent('resource.delivery_resolved')).toContainEqual([
      'workspace-resource-deliveries',
      'http://127.0.0.1:8790',
      'ws_1',
    ]);
    // The mapping stays per event: an upload progress tick does not refetch
    // derivatives, structure and deliveries.
    const uploaded = forEvent('resource.updated');
    expect(uploaded).toEqual([['workspace-resources', 'http://127.0.0.1:8790', 'ws_1']]);
  });

  it('refreshes the steer list a queued-message promotion creates', () => {
    const keys = queryInvalidationKeysForEvent({
      endpoint: 'http://127.0.0.1:8790',
      eventName: 'queued_message.promoted',
      sessionId: 'sess_1',
      workspaceId: 'ws_1',
    });

    // A promotion is a submission: it leaves the queue AND, when the turn is
    // mid-flight, appears as a pending steer.
    expect(keys).toContainEqual(['queued-messages', 'http://127.0.0.1:8790', 'sess_1']);
    expect(keys).toContainEqual(['pending-steers', 'http://127.0.0.1:8790', 'sess_1']);
  });

  it('refreshes the catalog the picker reads when the service refreshes it', () => {
    expect(
      queryInvalidationKeysForEvent({
        endpoint: 'http://127.0.0.1:8790',
        eventName: 'provider_catalog.refreshed',
        sessionId: 'sess_1',
        workspaceId: 'ws_1',
      }),
    ).toContainEqual(['provider-catalog', 'http://127.0.0.1:8790']);
  });

  it('refreshes the queue when an automatic promotion fails', () => {
    expect(
      queryInvalidationKeysForEvent({
        endpoint: 'http://127.0.0.1:8790',
        eventName: 'queued_message.promotion_failed',
        sessionId: 'sess_1',
        workspaceId: 'ws_1',
      }),
    ).toContainEqual(['queued-messages', 'http://127.0.0.1:8790', 'sess_1']);
  });

  it('refreshes the same reads for a cancelled conversion as for a failed one', () => {
    const forEvent = (eventName: string) =>
      queryInvalidationKeysForEvent({
        endpoint: 'http://127.0.0.1:8790',
        eventName,
        sessionId: 'sess_1',
        workspaceId: 'ws_1',
      });

    expect(forEvent('resource.processing_cancelled')).toEqual(
      forEvent('resource.processing_failed'),
    );
  });

  it('raises a visible notice when the queue stalls on a failed promotion', async () => {
    mocks.repository.stream.mockImplementation(async function* (
      _scope: unknown,
      _cursor: unknown,
      signal: AbortSignal,
    ) {
      yield {
        cursor: '77',
        eventName: 'queued_message.promotion_failed',
        receivedAt: '2026-08-31T12:00:00Z',
        data: {
          protocol_version: '0.3',
          type: 'queued_message.promotion_failed',
          occurred_at: '2026-08-31T12:00:00Z',
          scope: { connection_id: 'active', workspace_id: 'ws_1', session_id: 'sess_1' },
          entity_id: 'queued_1',
          entity_revision: 77,
          payload: {
            queued_message_id: 'queued_1',
            error: 'queue_auto_promotion_failed',
            recoverable: true,
          },
        },
      };
      await new Promise<void>((resolve) => {
        if (signal.aborted) resolve();
        else signal.addEventListener('abort', () => resolve(), { once: true });
      });
    });

    const { unmount } = renderHook(() =>
      useSessionLiveStream({ enabled: true, sessionId: 'sess_1', workspaceId: 'ws_1' }),
    );

    await waitFor(() => expect(mocks.toast.error).toHaveBeenCalled());
    expect(mocks.toast.error).toHaveBeenCalledWith(
      expect.stringContaining('queued message'),
      expect.objectContaining({ id: 'queued_message.promotion_failed:queued_1' }),
    );
    unmount();
  });

  it('reports reconnecting when the stream ends without an abort, even after a frame arrived', async () => {
    mocks.repository.stream.mockImplementation(async function* (
      _scope: unknown,
      _cursor: unknown,
      _signal: AbortSignal,
    ) {
      // Yields one frame, then the generator returns normally — simulating
      // the server closing the stream (idle timeout, restart) rather than
      // the consumer aborting it.
      yield { eventName: 'message.completed' };
    });

    const { unmount } = renderHook(() =>
      useSessionLiveStream({ enabled: true, sessionId: 'sess_1', workspaceId: 'ws_1' }),
    );

    await waitFor(() =>
      expect(mocks.storeState.setStreamState).toHaveBeenCalledWith('reconnecting'),
    );
    unmount();
  });

  it('invalidates the approvals query the workspace actually reads', async () => {
    const { QueryClient } =
      await vi.importActual<typeof import('@tanstack/react-query')>('@tanstack/react-query');
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
    expect(
      queryInvalidationKeysForEvent({
        endpoint: 'http://127.0.0.1:8790',
        eventName: 'a2ui.updated',
        sessionId: 'sess_child',
        workspaceId: 'ws_1',
      }),
    ).toContainEqual(['pending-interactions', 'http://127.0.0.1:8790']);
  });

  it('invalidates the unscoped questions query the workspace actually reads', async () => {
    const { QueryClient } = await vi.importActual<typeof import('@tanstack/react-query')>(
      '@tanstack/react-query',
    );
    const client = new QueryClient();
    // This is the ACTUAL cache key use-workspace-data.ts reads questions
    // under now that they are fetched unscoped, mirroring pending-approvals'
    // 'all-active' key rather than a per-session one.
    client.setQueryData(['pending-questions', 'http://127.0.0.1:8790', 'all-active'], []);

    const matched = queryInvalidationKeysForEvent({
      endpoint: 'http://127.0.0.1:8790',
      eventName: 'user_question.created',
      sessionId: 'sess_1',
      workspaceId: 'ws_1',
    }).flatMap((queryKey) =>
      client
        .getQueryCache()
        .findAll({ queryKey })
        .map((query) => query.queryKey),
    );

    expect(matched).toContainEqual(['pending-questions', 'http://127.0.0.1:8790', 'all-active']);
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
