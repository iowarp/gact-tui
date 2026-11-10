import type { PendingInteraction } from '@clio/core/v3';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { act, renderHook } from '@testing-library/react';
import type { ReactNode } from 'react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { queryKeys } from '@/lib/query-keys';

const mocks = vi.hoisted(() => ({
  repository: {
    capabilities: vi.fn(),
    respondInteraction: vi.fn(async () => ({})),
    respondPermission: vi.fn(async () => undefined),
    answerQuestion: vi.fn(),
    cancelQuestion: vi.fn(),
    a2uiAction: vi.fn(),
  },
}));

vi.mock('@/providers/connection-provider', () => ({
  useConnectionSettings: () => ({ settings: { endpoint: 'http://127.0.0.1:8790' } }),
}));
vi.mock('@/hooks/use-repository', () => ({ useRepository: () => mocks.repository }));

import { useAttentionResponse } from './use-attention-response';

function wrapperWith(capabilities: Record<string, unknown>) {
  const client = new QueryClient({
    defaultOptions: { mutations: { retry: false }, queries: { retry: false, staleTime: Infinity } },
  });
  client.setQueryData(queryKeys.key('capabilities', 'http://127.0.0.1:8790'), { capabilities });
  return function Wrapper({ children }: { children: ReactNode }) {
    return <QueryClientProvider client={client}>{children}</QueryClientProvider>;
  };
}

const permission: PendingInteraction = {
  id: 'interaction_1',
  kind: 'permission',
  owner_session_id: 'sess_child',
  attended_session_id: 'sess_root',
  status: 'pending',
  title: 'Run a command',
  source: { protocol: 'native', tool_name: 'bash' },
  created_at: '2026-09-01T00:00:00Z',
  payload: { permission_id: 'perm_1' },
  actions: ['allow', 'deny'],
};

describe('useAttentionResponse', () => {
  beforeEach(() => vi.clearAllMocks());

  it("answers through the request's own conversation when the agent has the unified route", async () => {
    const { result } = renderHook(() => useAttentionResponse(), {
      wrapper: wrapperWith({ x_clio_interactions: true }),
    });
    await act(() => result.current.mutateAsync({ interaction: permission, action: 'allow' }));
    expect(mocks.repository.respondInteraction).toHaveBeenCalledWith('sess_root', 'interaction_1', {
      action: 'allow',
    });
    expect(mocks.repository.respondPermission).not.toHaveBeenCalled();
  });

  it('falls back to the permission ledger on an older agent', async () => {
    const { result } = renderHook(() => useAttentionResponse(), { wrapper: wrapperWith({}) });
    await act(() => result.current.mutateAsync({ interaction: permission, action: 'deny' }));
    expect(mocks.repository.respondPermission).toHaveBeenCalledWith('perm_1', 'deny');
    expect(mocks.repository.respondInteraction).not.toHaveBeenCalled();
  });
});
