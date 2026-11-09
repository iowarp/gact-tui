import { cleanup, renderHook, waitFor } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import type { PropsWithChildren } from 'react';
import { afterEach, expect, it, vi } from 'vitest';
import { connectionScope } from '@/lib/connection-scope';
import { useWorkbenchRequest } from '@/lib/workbench-request-store';
import { useWorkbenchNavigation } from './use-workbench-navigation';

const settings = { endpoint: 'http://search-test' };
vi.mock('@/providers/connection-provider', () => ({
  useConnectionSettings: () => ({ settings: { endpoint: 'http://search-test' } }),
}));
vi.mock('@/store/live-store', () => ({
  useLiveStore: (selector: (state: unknown) => unknown) =>
    selector({ entities: { workspaces: { ws: { path: '/workspace' } } } }),
}));
afterEach(cleanup);

it.each([true, false])(
  'opens a global-search file only in the owning connection (matching=%s)',
  async (matching) => {
    const request = {
      kind: 'workspace-file',
      workspaceId: 'ws',
      path: 'notes/study.md',
      line: 4,
      find: 'reviewer',
    };
    const scope = matching ? connectionScope(settings) : 'a-different-connection';
    const wrapper = ({ children }: PropsWithChildren) => (
      <MemoryRouter
        initialEntries={[
          {
            pathname: '/workspaces/ws/sessions/s',
            state: { globalSearchResource: { scope, request } },
          },
        ]}
      >
        {children}
      </MemoryRouter>
    );
    const hook = renderHook(
      () => {
        const navigation = useWorkbenchNavigation({ allSessions: [], workspaceId: 'ws' });
        return { activeRequest: useWorkbenchRequest(navigation.requests) };
      },
      { wrapper },
    );
    if (matching)
      await waitFor(() => expect(hook.result.current.activeRequest?.request).toEqual(request));
    else expect(hook.result.current.activeRequest).toBeUndefined();
  },
);
