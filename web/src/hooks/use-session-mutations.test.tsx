import type { PendingInteraction } from '@clio/core/v3';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { renderHook, waitFor } from '@testing-library/react';
import { StrictMode, type ReactNode } from 'react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { queryKeys } from '@/lib/query-keys';

const mocks = vi.hoisted(() => ({
  uploadWorkspaceResources: vi.fn(),
  repository: {
    answerQuestion: vi.fn(async () => ({})),
    cancelQuestion: vi.fn(async () => ({})),
    createQueuedMessage: vi.fn(),
    pendingSteers: vi.fn(async () => []),
    queuedMessages: vi.fn(async () => []),
    respondPermission: vi.fn(async () => undefined),
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
vi.mock('@/lib/upload-workspace-resources', () => ({
  uploadWorkspaceResources: mocks.uploadWorkspaceResources,
}));

import { useSessionMutations, type SessionSendInput } from './use-session-mutations';

function wrapper({ children }: { children: ReactNode }) {
  const client = new QueryClient({
    defaultOptions: { mutations: { retry: false }, queries: { retry: false } },
  });
  return <QueryClientProvider client={client}>{children}</QueryClientProvider>;
}

function strictWrapper({ children }: { children: ReactNode }) {
  const client = new QueryClient({
    defaultOptions: { mutations: { retry: false }, queries: { retry: false } },
  });
  return (
    <StrictMode>
      <QueryClientProvider client={client}>{children}</QueryClientProvider>
    </StrictMode>
  );
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

function renderMutationsWithClient(client: QueryClient) {
  return renderHook(
    () =>
      useSessionMutations({
        activeModel: 'gpt-5.6-luna',
        activeProvider: 'codex',
        sessionId: 'sess_1',
        workspaceId: 'ws_1',
      }),
    {
      wrapper: ({ children }: { children: ReactNode }) => (
        <QueryClientProvider client={client}>{children}</QueryClientProvider>
      ),
    },
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

  it('mints a fresh identity when only the structured reference changes', async () => {
    mocks.repository.submitMessage.mockRejectedValue(new Error('connection interrupted'));
    const { result } = renderMutations();
    const reference = (refId: string) => ({
      type: 'context_ref' as const,
      ref_kind: 'artifact' as const,
      ref_id: refId,
      label: 'Review notes',
      revision: 'v1',
    });

    await result.current.send
      .mutateAsync({ ...draft, references: [reference('artifact_a')] })
      .catch(() => undefined);
    await result.current.send
      .mutateAsync({ ...draft, references: [reference('artifact_b')] })
      .catch(() => undefined);

    const keys = mocks.repository.submitMessage.mock.calls.map(
      (call) => call[1].idempotency_key as string,
    );
    expect(keys[0]).not.toBe(keys[1]);
  });
});

describe('useSessionMutations attachment preparation', () => {
  it('keeps the upload signal active after the StrictMode effect replay', async () => {
    mocks.uploadWorkspaceResources.mockResolvedValue({ parts: [], resources: [] });
    const file = {
      type: 'file' as const,
      filename: 'paper.pdf',
      mediaType: 'application/pdf',
      url: 'blob:strict-paper-pdf',
    };
    const { result } = renderHook(
      () =>
        useSessionMutations({
          activeModel: 'gpt-5.6-luna',
          activeProvider: 'codex',
          sessionId: 'sess_1',
          workspaceId: 'ws_1',
        }),
      { wrapper: strictWrapper },
    );

    await result.current.prepareFiles([file]);

    const uploadOptions = mocks.uploadWorkspaceResources.mock.calls[0]?.[0];
    expect(uploadOptions.signal.aborted).toBe(false);
  });

  it('reuses the immediate upload when the message is submitted', async () => {
    mocks.repository.submitMessage.mockResolvedValue({ message_id: 'message_resource' });
    mocks.uploadWorkspaceResources.mockResolvedValue({
      parts: [
        {
          type: 'resource_ref',
          resource_id: 'resource_pdf',
          resource_revision: '1',
          name: 'paper.pdf',
        },
      ],
      resources: [
        {
          id: 'resource_pdf',
          workspace_id: 'ws_1',
          name: 'paper.pdf',
          revision: 1,
        },
      ],
    });
    const file = {
      type: 'file' as const,
      filename: 'paper.pdf',
      mediaType: 'application/pdf',
      url: 'blob:paper-pdf',
    };
    const { result } = renderMutations();

    await result.current.prepareFiles([file]);
    await result.current.send.mutateAsync({
      ...draft,
      files: [file],
      text: 'Read the title.',
    });

    expect(mocks.uploadWorkspaceResources).toHaveBeenCalledOnce();
    expect(mocks.repository.submitMessage).toHaveBeenCalledWith(
      'sess_1',
      expect.objectContaining({
        parts: [
          { type: 'text', text: 'Read the title.' },
          {
            type: 'resource_ref',
            resource_id: 'resource_pdf',
            resource_revision: '1',
            name: 'paper.pdf',
          },
        ],
      }),
    );
  });
});

describe('useSessionMutations pending-question invalidation', () => {
  // The read now lives at the unscoped, endpoint-level key use-workspace-data.ts
  // registers it under (queryKeys.key('pending-questions', endpoint, 'all-active')),
  // mirroring pending-approvals. Prove the mutation invalidates THAT actual
  // query — a per-session key would never match it, and a poll interval is
  // not an acceptable substitute for a person seeing the bell clear at once.
  const readKey = queryKeys.key('pending-questions', 'http://127.0.0.1:8790', 'all-active');

  function clientWithReadPopulated() {
    const client = new QueryClient({
      defaultOptions: { mutations: { retry: false }, queries: { retry: false } },
    });
    client.setQueryData(readKey, []);
    return client;
  }

  it('invalidates the unscoped pending-questions read when a question is answered', async () => {
    const client = clientWithReadPopulated();
    const { result } = renderMutationsWithClient(client);

    await result.current.answerQuestion.mutateAsync({
      id: 'question_1',
      answer: { answer: 'yes' },
    });

    await waitFor(() =>
      expect(client.getQueryCache().find({ queryKey: readKey })?.state.isInvalidated).toBe(true),
    );
  });

  it('invalidates the unscoped pending-questions read when a question is cancelled', async () => {
    const client = clientWithReadPopulated();
    const { result } = renderMutationsWithClient(client);

    await result.current.cancelQuestion.mutateAsync('question_1');

    await waitFor(() =>
      expect(client.getQueryCache().find({ queryKey: readKey })?.state.isInvalidated).toBe(true),
    );
  });

  // Confirms the sibling approval mutation did NOT drift the same way: it
  // already invalidates the endpoint-level prefix, which still matches the
  // unchanged 'all-active' approvals read key use-workspace-data.ts uses.
  it('still invalidates the real unscoped pending-approvals read on a permission response', async () => {
    const approvalsReadKey = queryKeys.key(
      'pending-approvals',
      'http://127.0.0.1:8790',
      'all-active',
    );
    const client = new QueryClient({
      defaultOptions: { mutations: { retry: false }, queries: { retry: false } },
    });
    client.setQueryData(approvalsReadKey, []);
    const { result } = renderMutationsWithClient(client);

    await result.current.respondPermission.mutateAsync({ id: 'perm_1', action: 'allow' });

    await waitFor(() =>
      expect(client.getQueryCache().find({ queryKey: approvalsReadKey })?.state.isInvalidated).toBe(
        true,
      ),
    );
  });

  // respondInteraction is the mutation the pending-interactions surface actually
  // calls (ClioPendingInteractions -> workspace-page's onResponse), unlike the
  // answerQuestion/cancelQuestion mutations above which nothing in the app wires
  // up. Its own onSettled invalidation drifted the same way theirs once did.
  it('invalidates the unscoped pending-questions read when respondInteraction answers a question', async () => {
    const client = clientWithReadPopulated();
    const { result } = renderMutationsWithClient(client);
    const interaction: PendingInteraction = {
      id: 'question:q1',
      kind: 'question',
      owner_session_id: 'sess_child',
      attended_session_id: 'sess_1',
      status: 'pending',
      title: 'Question from agent',
      source: { protocol: 'native' },
      created_at: '2026-09-02T00:00:00Z',
      payload: { question_id: 'q1' },
      actions: ['answer', 'cancel'],
    };

    await result.current.respondInteraction.mutateAsync({
      interaction,
      response: { action: 'answer', answer: 'yes' },
    });

    await waitFor(() =>
      expect(client.getQueryCache().find({ queryKey: readKey })?.state.isInvalidated).toBe(true),
    );
  });
});
