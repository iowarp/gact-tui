import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { renderHook, waitFor } from '@testing-library/react';
import type { ReactNode } from 'react';
import { beforeEach, describe, expect, it, vi } from 'vitest';

const mocks = vi.hoisted(() => ({
  repository: {
    createQueuedMessage: vi.fn(),
    pendingSteers: vi.fn(async () => []),
    queuedMessages: vi.fn(async () => []),
    submitMessage: vi.fn(),
  },
  replaceSnapshots: vi.fn(),
}));

vi.mock('@/providers/connection-provider', () => ({
  useConnectionSettings: () => ({ settings: { endpoint: 'http://127.0.0.1:8790' } }),
}));
vi.mock('@/store/live-store', () => ({
  useLiveStore: Object.assign(
    (selector: (state: { replaceSnapshots: unknown }) => unknown) =>
      selector({ replaceSnapshots: mocks.replaceSnapshots }),
    { getState: () => ({ entities: { sessions: {} } }) },
  ),
}));
vi.mock('./use-repository', () => ({ useRepository: () => mocks.repository }));
vi.mock('react-router-dom', () => ({ useNavigate: () => vi.fn() }));

import { useSessionMutations, type SessionSendInput } from './use-session-mutations';

function wrapper({ children }: { children: ReactNode }) {
  const client = new QueryClient({
    defaultOptions: { mutations: { retry: false }, queries: { retry: false } },
  });
  return <QueryClientProvider client={client}>{children}</QueryClientProvider>;
}

const behavior = {
  confirmation_policy: 'ask',
  execution_mode: 'execute',
  reasoning_effort: 'medium',
} as const;

const draft: SessionSendInput = { behavior, delivery: 'start', text: 'Check the station table.' };

beforeEach(() => vi.clearAllMocks());

function renderMutations() {
  return renderHook(
    () =>
      useSessionMutations({
        activeModel: 'gpt-5.6-luna',
        activeProvider: 'codex',
        sessionId: 'sess_1',
        workspaceId: 'ws_1',
      }),
    { wrapper },
  );
}

describe('useSessionMutations send identity', () => {
  it('reuses one idempotency key while the same draft is being retried', async () => {
    mocks.repository.submitMessage.mockRejectedValue(new Error('connection interrupted'));
    const { result } = renderMutations();

    await result.current.send.mutateAsync(draft).catch(() => undefined);
    await result.current.send.mutateAsync(draft).catch(() => undefined);

    await waitFor(() => expect(mocks.repository.submitMessage).toHaveBeenCalledTimes(2));
    const [first, second] = mocks.repository.submitMessage.mock.calls;
    // A retry of an unsent draft must be the same logical message, or a send
    // whose response was lost is delivered twice.
    expect(first?.[1].idempotency_key).toBe(second?.[1].idempotency_key);
    expect(first?.[1].client_message_id).toBe(second?.[1].client_message_id);
  });

  it('mints a fresh identity for a different draft and after one is accepted', async () => {
    mocks.repository.submitMessage.mockRejectedValueOnce(new Error('connection interrupted'));
    const { result } = renderMutations();

    await result.current.send.mutateAsync(draft).catch(() => undefined);
    await result.current.send
      .mutateAsync({ ...draft, text: 'A different question.' })
      .catch(() => undefined);
    mocks.repository.submitMessage.mockResolvedValue({ message_id: 'message_1' });
    await result.current.send.mutateAsync({ ...draft, text: 'A different question.' });
    await result.current.send
      .mutateAsync({ ...draft, text: 'A different question.' })
      .catch(() => undefined);

    const keys = mocks.repository.submitMessage.mock.calls.map(
      (call) => call[1].idempotency_key as string,
    );
    expect(keys[0]).not.toBe(keys[1]);
    expect(keys[1]).toBe(keys[2]);
    // The accepted send releases the identity; the next one is a new message.
    expect(keys[3]).not.toBe(keys[2]);
  });
});
