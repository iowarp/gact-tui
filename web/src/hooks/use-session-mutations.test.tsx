import type { PendingInteraction, Session } from '@clio/core/v3';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { renderHook, waitFor } from '@testing-library/react';
import { StrictMode, type ReactNode } from 'react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { queryKeys } from '@/lib/query-keys';

const mocks = vi.hoisted(() => ({
  navigate: vi.fn(),
  firstMessageMetadata: vi.fn(async () => ({
    a2uiClientCapabilities: { 'v0.9': { supportedCatalogIds: ['test-catalog'] } },
  })),
  uploadWorkspaceResources: vi.fn(),
  repository: {
    createSession: vi.fn(),
    answerQuestion: vi.fn(async () => ({})),
    cancelQuestion: vi.fn(async () => ({})),
    cancelSession: vi.fn(async () => undefined),
    createQueuedMessage: vi.fn(),
    languageModelConfiguration: vi.fn(),
    pendingSteers: vi.fn(async () => []),
    queuedMessages: vi.fn(async () => []),
    respondPermission: vi.fn(async () => undefined),
    submitMessage: vi.fn(),
    updateLanguageModelConfiguration: vi.fn(),
    updateSession: vi.fn(),
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
vi.mock('react-router-dom', () => ({ useNavigate: () => mocks.navigate }));
vi.mock('@/lib/upload-workspace-resources', () => ({
  uploadWorkspaceResources: mocks.uploadWorkspaceResources,
}));
vi.mock('@/lib/a2ui/first-message-metadata', () => ({
  firstMessageMetadata: mocks.firstMessageMetadata,
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

beforeEach(() => {
  vi.clearAllMocks();
  mocks.repository.createSession.mockReset().mockResolvedValue({
    id: 'sess_created',
    workspace_id: 'ws_1',
    mode: 'edit',
    routing_mode: 'auto',
  });
});

function renderDraft() {
  return renderHook(
    () =>
      useSessionMutations({
        activeModel: 'gpt-5.6-luna',
        activeProvider: 'codex',
        sessionId: '',
        workspaceId: 'ws_1',
        createOnSend: true,
      }),
    { wrapper: strictWrapper },
  );
}

describe('presentation-only conversation', () => {
  it('preserves question ownership on the ordinary queued-message path', async () => {
    mocks.repository.createQueuedMessage.mockResolvedValue({ id: 'queued_answer' });
    const { result } = renderDraft();
    await result.current.send.mutateAsync({
      ...draft,
      delivery: 'queued',
      answersQuestionId: 'q1',
    });
    expect(mocks.repository.createQueuedMessage).toHaveBeenCalledWith(
      'sess_created',
      expect.objectContaining({ metadata: { answers_question_id: 'q1' } }),
    );
    expect(mocks.repository.submitMessage).not.toHaveBeenCalled();
  });
  it('shares session creation between overlapping sends', async () => {
    mocks.repository.submitMessage.mockResolvedValue({ message_id: 'message_1' });
    const { result } = renderDraft();
    await Promise.all([
      result.current.send.mutateAsync(draft),
      result.current.send.mutateAsync(draft),
    ]);
    expect(mocks.repository.createSession).toHaveBeenCalledTimes(1);
    const [first, second] = mocks.repository.submitMessage.mock.calls;
    expect(first).toEqual(second);
  });
  it('creates nothing on mount or invalid input; creates and opens a session on first send', async () => {
    mocks.repository.submitMessage.mockResolvedValue({ message_id: 'message_1' });
    const { result } = renderDraft();
    expect(mocks.repository.createSession).not.toHaveBeenCalled();
    await expect(result.current.send.mutateAsync({ ...draft, text: ' ' })).rejects.toThrow(
      'Write a message',
    );
    expect(mocks.repository.createSession).not.toHaveBeenCalled();
    await result.current.send.mutateAsync(draft);
    expect(mocks.repository.createSession).toHaveBeenCalledTimes(1);
    expect(mocks.repository.createSession).toHaveBeenCalledWith({
      workspace_id: 'ws_1',
      title: 'New conversation',
      mode: 'edit',
      routing_mode: 'auto',
      approval_mode: 'ask',
    });
    expect(mocks.repository.submitMessage).toHaveBeenCalledWith(
      'sess_created',
      expect.objectContaining({
        parts: [{ type: 'text', text: draft.text }],
        metadata: { a2uiClientCapabilities: { 'v0.9': { supportedCatalogIds: ['test-catalog'] } } },
      }),
    );
    expect(mocks.navigate).toHaveBeenCalledWith('/workspaces/ws_1/sessions/sess_created', {
      replace: true,
    });
  });

  it('reuses the created session and message identity after a failed first send', async () => {
    mocks.repository.submitMessage
      .mockRejectedValueOnce(new Error('connection interrupted'))
      .mockResolvedValue({ message_id: 'message_1' });
    const { result } = renderDraft();
    await expect(result.current.send.mutateAsync(draft)).rejects.toThrow('connection interrupted');
    expect(mocks.navigate).not.toHaveBeenCalled();
    await result.current.send.mutateAsync(draft);
    expect(mocks.repository.createSession).toHaveBeenCalledTimes(1);
    const [first, second] = mocks.repository.submitMessage.mock.calls;
    expect(first).toEqual(second);
  });

  it('allows retry when creating the session itself failed', async () => {
    mocks.repository.createSession.mockRejectedValueOnce(new Error('service unavailable'));
    mocks.repository.submitMessage.mockResolvedValue({ message_id: 'message_1' });
    const { result } = renderDraft();
    await expect(result.current.send.mutateAsync(draft)).rejects.toThrow('service unavailable');
    expect(mocks.repository.submitMessage).not.toHaveBeenCalled();
    await result.current.send.mutateAsync(draft);
    expect(mocks.repository.createSession).toHaveBeenCalledTimes(2);
    expect(mocks.repository.submitMessage).toHaveBeenCalledTimes(1);
  });

  it('does not navigate back when a submitted message completes after leaving', async () => {
    let accept!: (value: unknown) => void;
    mocks.repository.submitMessage.mockImplementationOnce(
      () =>
        new Promise((resolve) => {
          accept = resolve;
        }),
    );
    const { result, unmount } = renderDraft();
    const send = result.current.send.mutateAsync(draft);
    await waitFor(() => expect(mocks.repository.submitMessage).toHaveBeenCalledTimes(1));
    unmount();
    accept({ message_id: 'message_1' });
    await send;
    expect(mocks.navigate).not.toHaveBeenCalled();
  });
});

function renderMutations(session?: Session) {
  return renderHook(
    () =>
      useSessionMutations({
        activeModel: 'gpt-5.6-luna',
        activeProvider: 'codex',
        session,
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

describe('stopping a turn', () => {
  it('reconciles submitted feedback and the paused queue after Stop', async () => {
    const client = new QueryClient({
      defaultOptions: { mutations: { retry: false }, queries: { retry: false } },
    });
    const invalidate = vi.spyOn(client, 'invalidateQueries');
    const { result } = renderMutationsWithClient(client);

    await result.current.cancel.mutateAsync();

    expect(mocks.repository.cancelSession).toHaveBeenCalledWith('sess_1');
    const endpoint = 'http://127.0.0.1:8790';
    for (const queryKey of [
      queryKeys.pendingSteers(endpoint, 'sess_1'),
      queryKeys.queuedMessages(endpoint, 'sess_1'),
      queryKeys.transcript(endpoint, 'sess_1'),
      queryKeys.sessions(endpoint, 'ws_1'),
      queryKeys.sessions(endpoint, 'all'),
    ]) {
      expect(invalidate).toHaveBeenCalledWith({ queryKey });
    }
    expect(mocks.repository.submitMessage).not.toHaveBeenCalled();
    expect(mocks.repository.createQueuedMessage).not.toHaveBeenCalled();
  });
});

describe('useSessionMutations send identity', () => {
  it('sends the picked model as the message route with no global provider apply', async () => {
    // A fresh install has no provider bound globally; the session's own pick is
    // the whole choice and the service builds what it needs for that turn.
    mocks.repository.submitMessage.mockResolvedValue({ message_id: 'message_1' });
    const { result } = renderHook(
      () =>
        useSessionMutations({
          activeModel: 'openai/gpt-oss-120b:free',
          activeProvider: 'openrouter',
          sessionId: 'sess_1',
          workspaceId: 'ws_1',
        }),
      { wrapper },
    );

    await result.current.send.mutateAsync(draft);

    expect(mocks.repository.languageModelConfiguration).not.toHaveBeenCalled();
    expect(mocks.repository.updateLanguageModelConfiguration).not.toHaveBeenCalled();
    expect(mocks.repository.submitMessage).toHaveBeenCalledTimes(1);
    expect(mocks.repository.submitMessage.mock.calls[0]?.[1].model).toEqual({
      model_id: 'openai/gpt-oss-120b:free',
      provider_id: 'openrouter',
    });
  });

  it('sends a Codex route as provider and model only, with no transport variant', async () => {
    mocks.repository.submitMessage.mockResolvedValue({ message_id: 'message_1' });
    const { result } = renderMutations();

    await result.current.send.mutateAsync(draft);

    expect(mocks.repository.submitMessage.mock.calls[0]?.[1].model).toStrictEqual({
      model_id: 'gpt-5.6-luna',
      provider_id: 'codex',
    });
  });

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

describe('useSessionMutations execution mode', () => {
  const session = {
    id: 'sess_1',
    mode: 'edit',
    routing_mode: 'auto',
  } as Session;

  beforeEach(() => {
    mocks.repository.updateSession.mockImplementation(
      async (_sessionId: string, patch: Partial<Session>) => ({ ...session, ...patch }),
    );
    mocks.repository.submitMessage.mockResolvedValue({ message_id: 'message_plan' });
  });

  it('enters authoritative plan mode before starting a plan turn', async () => {
    const { result } = renderMutations(session);

    await result.current.send.mutateAsync({
      ...draft,
      behavior: { ...behavior, execution_mode: 'plan' },
    });

    expect(mocks.repository.updateSession).toHaveBeenCalledWith('sess_1', {
      mode: 'plan',
      routing_mode: 'auto',
    });
    expect(mocks.repository.updateSession.mock.invocationCallOrder[0]).toBeLessThan(
      mocks.repository.submitMessage.mock.invocationCallOrder[0] ?? Number.POSITIVE_INFINITY,
    );
  });

  it('enters authoritative architect mode before starting deep research', async () => {
    const { result } = renderMutations(session);

    await result.current.send.mutateAsync({
      ...draft,
      behavior: { ...behavior, execution_mode: 'deep_research' },
    });

    expect(mocks.repository.updateSession).toHaveBeenCalledWith('sess_1', {
      mode: 'architect',
      routing_mode: 'experts',
    });
  });

  it('does not mutate the authoritative mode for a steer into an active turn', async () => {
    const { result } = renderMutations(session);

    await result.current.send.mutateAsync({
      ...draft,
      behavior: { ...behavior, execution_mode: 'plan' },
      delivery: 'steer',
    });

    expect(mocks.repository.updateSession).not.toHaveBeenCalled();
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

  it('combines per-attachment cancellation with the session upload lifetime', async () => {
    mocks.uploadWorkspaceResources.mockResolvedValue({ parts: [], resources: [] });
    const file = {
      type: 'file' as const,
      filename: 'paper.pdf',
      mediaType: 'application/pdf',
      url: 'blob:cancel-paper-pdf',
    };
    const attachmentController = new AbortController();
    const { result } = renderMutations();

    await result.current.prepareFiles([file], undefined, attachmentController.signal);
    const uploadOptions = mocks.uploadWorkspaceResources.mock.calls[0]?.[0];
    expect(uploadOptions.signal.aborted).toBe(false);

    attachmentController.abort();
    expect(uploadOptions.signal.aborted).toBe(true);
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

  it('refreshes authoritative session posture after a Plan approval response', async () => {
    const client = clientWithReadPopulated();
    const sessionsKey = queryKeys.sessions('http://127.0.0.1:8790', 'ws_1');
    client.setQueryData(sessionsKey, []);
    const { result } = renderMutationsWithClient(client);
    const interaction: PendingInteraction = {
      id: 'question:plan_exit',
      kind: 'question',
      owner_session_id: 'sess_1',
      attended_session_id: 'sess_1',
      status: 'pending',
      title: 'Review execution plan',
      source: { protocol: 'native', tool_name: 'plan_exit' },
      created_at: '2026-09-07T00:00:00Z',
      payload: { question_id: 'plan_exit' },
      actions: ['answer'],
    };

    await result.current.respondInteraction.mutateAsync({
      interaction,
      response: { action: 'answer', selected_options: ['auto'] },
    });

    await waitFor(() =>
      expect(client.getQueryCache().find({ queryKey: sessionsKey })?.state.isInvalidated).toBe(
        true,
      ),
    );
  });
});
