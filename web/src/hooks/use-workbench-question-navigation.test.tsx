import type { Session, SubagentRun } from '@clio/core/v3';
import { act, cleanup, renderHook } from '@testing-library/react';
import { MemoryRouter, useLocation } from 'react-router-dom';
import type { PropsWithChildren } from 'react';
import { afterEach, expect, it, vi } from 'vitest';
import { useWorkbenchNavigation } from './use-workbench-navigation';

const fixtures = vi.hoisted(() => ({
  children: {} as Record<string, SubagentRun>,
  error: vi.fn(),
}));
vi.mock('sonner', () => ({ toast: { error: fixtures.error } }));
vi.mock('@/providers/connection-provider', () => ({
  useConnectionSettings: () => ({ settings: { endpoint: 'http://test-service' } }),
}));
vi.mock('@/store/live-store', () => ({
  useLiveStore: Object.assign(
    (selector: (value: unknown) => unknown) =>
      selector({ entities: { workspaces: { ws: { path: '/workspace' } } } }),
    { getState: () => ({ entities: { subagents: fixtures.children } }) },
  ),
}));
afterEach(() => {
  cleanup();
  fixtures.children = {};
  vi.clearAllMocks();
});

function setup(allSessions: Session[] = []) {
  const wrapper = ({ children }: PropsWithChildren) => (
    <MemoryRouter initialEntries={['/workspaces/ws/sessions/root']}>{children}</MemoryRouter>
  );
  return renderHook(
    () => ({
      navigation: useWorkbenchNavigation({ allSessions, workspaceId: 'ws' }),
      location: useLocation(),
    }),
    { wrapper },
  );
}

it('opens the exact child canvas while preserving the central conversation', () => {
  const child = {
    id: 'task',
    session_id: 'root',
    child_session_id: 'child',
    title: 'Reviewer',
    state: 'waiting_user',
  } as SubagentRun;
  fixtures.children = { task: child };
  const hook = setup();
  act(() => {
    expect(hook.result.current.navigation.revealSurfaceOwner('child')).toBe(true);
  });
  expect(hook.result.current.navigation.activeRequest?.request).toEqual({
    kind: 'subagent',
    subagent: child,
  });
  expect(hook.result.current.location.pathname).toBe('/workspaces/ws/sessions/root');
});

it('uses the saved owning workspace when a retired child has no active canvas entry', () => {
  const hook = setup([{ id: 'saved', workspace_id: 'other', title: 'Saved reviewer' } as Session]);
  act(() => {
    expect(hook.result.current.navigation.revealSurfaceOwner('saved')).toBe(true);
  });
  expect(hook.result.current.location.pathname).toBe('/workspaces/other/sessions/saved');
});

it('reports an unavailable owner without opening a guessed destination', () => {
  const hook = setup();
  act(() => {
    expect(hook.result.current.navigation.revealSurfaceOwner('unknown')).toBe(false);
  });
  expect(fixtures.error).toHaveBeenCalledWith(
    'The linked conversation is not available yet. Try again.',
  );
  expect(hook.result.current.navigation.activeRequest).toBeUndefined();
  expect(hook.result.current.location.pathname).toBe('/workspaces/ws/sessions/root');
});
