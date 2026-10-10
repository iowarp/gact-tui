import type { Session } from '@clio/core/v3';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { act, cleanup, renderHook } from '@testing-library/react';
import type { ReactNode } from 'react';
import { afterEach, beforeEach, expect, it, vi } from 'vitest';
import { useLiveStore } from '@/store/live-store';

const mocks = vi.hoisted(() => ({ updateSession: vi.fn(), navigate: vi.fn() }));
vi.mock('./use-repository', () => ({
  useRepository: () => ({ updateSession: mocks.updateSession }),
}));
vi.mock('react-router-dom', () => ({ useNavigate: () => mocks.navigate }));
vi.mock('./use-available-session-navigation', () => ({
  useAvailableSessionNavigation: () => mocks.navigate,
}));
vi.mock('@/providers/connection-provider', () => ({
  useConnectionSettings: () => ({ settings: { endpoint: 'http://localhost:8100' } }),
}));

import { useWorkspaceNavigationActions } from './use-workspace-navigation-actions';

const session: Session = {
  id: 's1',
  workspace_id: 'w1',
  title: 'Review',
  state: 'running',
  pinned: false,
  archived: false,
  created_at: '2026-10-10T00:00:00Z',
  updated_at: '2026-10-10T00:00:00Z',
  mode: 'edit',
  edit_mode: 'diff',
  routing_mode: 'auto',
  approval_mode: 'ask',
};

function wrapper({ children }: { children: ReactNode }) {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  return <QueryClientProvider client={client}>{children}</QueryClientProvider>;
}

beforeEach(() => {
  vi.clearAllMocks();
  useLiveStore.getState().reset();
  useLiveStore.getState().replaceSnapshots({ sessions: { s1: session } });
});
afterEach(() => {
  cleanup();
  useLiveStore.getState().reset();
});

it('applies acknowledged identity fields without rewinding work received during the request', async () => {
  let finish!: (session: Session) => void;
  mocks.updateSession.mockImplementation(
    () =>
      new Promise<Session>((resolve) => {
        finish = resolve;
      }),
  );
  const { result } = renderHook(() => useWorkspaceNavigationActions('w1', 's1'), { wrapper });
  let pending!: Promise<void>;
  act(() => {
    pending = result.current.navigationActions.setSessionPinned('s1', true);
  });
  act(() => {
    useLiveStore
      .getState()
      .replaceSnapshots({
        sessions: { s1: { ...session, title: 'Live title', state: 'completed' } },
      });
  });
  await act(async () => {
    finish({ ...session, pinned: true });
    await pending;
  });
  expect(useLiveStore.getState().entities.sessions['s1']).toMatchObject({
    pinned: true,
    title: 'Live title',
    state: 'completed',
  });
});

it('uses the service name after rename and leaves unrelated pin/state fields intact', async () => {
  mocks.updateSession.mockResolvedValue({
    ...session,
    title: 'Service title',
    state: 'queued',
    pinned: true,
  });
  const { result } = renderHook(() => useWorkspaceNavigationActions('w1', 's1'), { wrapper });
  await act(async () => {
    await result.current.navigationActions.renameSession('s1', 'Requested title');
  });
  expect(useLiveStore.getState().entities.sessions['s1']).toMatchObject({
    title: 'Service title',
    pinned: false,
    state: 'running',
  });
});

it('leaves the current row intact when the service rejects the change', async () => {
  mocks.updateSession.mockRejectedValue(new Error('Offline'));
  const { result } = renderHook(() => useWorkspaceNavigationActions('w1', 's1'), { wrapper });
  await expect(result.current.navigationActions.setSessionPinned('s1', true)).rejects.toThrow(
    'Offline',
  );
  expect(useLiveStore.getState().entities.sessions['s1']).toEqual(session);
});
