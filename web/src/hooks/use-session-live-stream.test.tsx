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
    queryClient: { invalidateQueries: vi.fn(), setQueryData: vi.fn() },
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

import { useSessionLiveStream } from './use-session-live-stream';

describe('useSessionLiveStream resume recovery', () => {
  beforeEach(() => {
    mocks.repository.stream.mockReset();
    mocks.resume = undefined;
    mocks.storeState.setStreamState.mockReset();
    mocks.repository.stream.mockImplementation(
      async function* (_scope: unknown, _cursor: unknown, signal: AbortSignal) {
        await new Promise<void>((resolve) => {
          if (signal.aborted) resolve();
          else signal.addEventListener('abort', () => resolve(), { once: true });
        });
        if (!signal.aborted) yield undefined;
      },
    );
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
});
