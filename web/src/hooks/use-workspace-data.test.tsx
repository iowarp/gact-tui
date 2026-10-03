import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { act, renderHook, waitFor } from '@testing-library/react';
import type {
  LanguageModelConfiguration,
  SessionArtifactListing,
  TranscriptSnapshot,
} from '@clio/core/v3';
import type { ReactNode } from 'react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

const mocks = vi.hoisted(() => ({
  mergeSnapshots: vi.fn(),
  useSessionLiveStream: vi.fn(),
  // Default matches the real provider's default (owner ruling: dot files are
  // visible by default; "Hide dot files and folders" is opt-in).
  useAppearancePreferences: vi.fn(() => ({ hideDotFiles: false })),
  repository: {
    agentBlueprints: vi.fn(async () => []),
    allSessions: vi.fn(async () => [] as unknown[]),
    capabilities: vi.fn(async () => ({}) as unknown),
    languageModelConfiguration: vi.fn(
      async (): Promise<LanguageModelConfiguration> => ({
        configured: false,
        provider: '',
        api_base: '',
        model: '',
        presets: [],
      }),
    ),
    pendingApprovals: vi.fn(async () => [] as unknown[]),
    pendingInteractionProjection: vi.fn(async () => ({
      interactions: [] as unknown[],
      degradations: [] as { reason: string; detail: string }[],
    })),
    pendingQuestions: vi.fn(async () => [] as unknown[]),
    providerCatalog: vi.fn(async () => ({ providers: [] })),
    providerModels: vi.fn(async () => ({ models: [] })),
    resources: vi.fn(async () => []),
    sessionArtifacts: vi.fn(
      async (): Promise<SessionArtifactListing> => ({
        artifacts: [],
        used: [],
        count: 0,
        include_children: true,
        child_session_ids: [],
      }),
    ),
    sessions: vi.fn(async () => [] as unknown[]),
    transcript: vi.fn(
      async (): Promise<TranscriptSnapshot> => ({
        messages: [],
        tools: [],
        tasks: [],
        subagents: [],
        artifacts: [],
        surfaces: [],
      }),
    ),
    workspaceFiles: vi.fn(async () => ({ entries: [], truncated: false })),
    workspaces: vi.fn(async () => []),
  },
}));

vi.mock('@/providers/connection-provider', () => ({
  useConnectionSettings: () => ({ settings: { endpoint: 'http://127.0.0.1:8790' } }),
}));
vi.mock('@/providers/appearance-provider', () => ({
  useAppearancePreferences: mocks.useAppearancePreferences,
}));
vi.mock('./use-repository', () => ({ useRepository: () => mocks.repository }));
vi.mock('./use-session-live-stream', () => ({
  useSessionLiveStream: mocks.useSessionLiveStream,
}));
vi.mock('./use-variant-run-hydration', () => ({ useVariantRunHydration: () => undefined }));
vi.mock('./use-session-context', () => ({
  useSessionContext: () => ({ state: { data: undefined } }),
}));
vi.mock('./use-session-observability', () => ({
  useSessionObservability: () => ({ processes: { data: [] }, diffs: { data: [] } }),
}));
vi.mock('./use-execution-provenance', () => ({
  useExecutionProvenance: () => ({ data: undefined }),
}));
vi.mock('@/store/live-store', () => {
  const state = {
    entities: {
      artifacts: {},
      context: {},
      runs: {},
      sessions: {},
      surfaces: {},
      subagents: {},
      tasks: {},
      tools: {},
      workspaces: {},
    },
    mergeSnapshots: mocks.mergeSnapshots,
  };
  return {
    useLiveStore: Object.assign((selector: (value: typeof state) => unknown) => selector(state), {
      getState: () => state,
    }),
  };
});

import { useWorkspaceData } from './use-workspace-data';

const approval = {
  id: 'perm_1',
  session_id: 'sess_1',
  tool_name: 'shell.exec',
  input: { cmd: 'inspect' },
  summary: 'Run the analysis command',
  reason: 'The agent needs shell access.',
  status: 'pending',
  created_at: '2026-09-02T00:00:00Z',
};

function wrapper({ children }: { children: ReactNode }) {
  const client = new QueryClient({
    defaultOptions: { mutations: { retry: false }, queries: { retry: false } },
  });
  return <QueryClientProvider client={client}>{children}</QueryClientProvider>;
}

function renderWorkspaceData(overrides: { filesViewActive?: boolean } = {}) {
  return renderHook(
    () =>
      useWorkspaceData({
        contextTargetId: 'sess_1',
        filesViewActive: overrides.filesViewActive,
        sessionId: 'sess_1',
        workspaceId: 'ws_1',
      }),
    { wrapper },
  );
}

beforeEach(() => {
  vi.clearAllMocks();
  mocks.useSessionLiveStream.mockReturnValue(undefined);
  // mockReturnValue survives clearAllMocks (only call history is cleared), so
  // restore the real provider's default explicitly between tests.
  mocks.useAppearancePreferences.mockReturnValue({ hideDotFiles: false });
  mocks.repository.capabilities.mockResolvedValue({ capabilities: {}, gact_versions: [] });
  mocks.repository.pendingApprovals.mockResolvedValue([]);
  mocks.repository.pendingQuestions.mockResolvedValue([]);
  mocks.repository.pendingInteractionProjection.mockResolvedValue({ interactions: [], degradations: [] });
  mocks.repository.sessions.mockResolvedValue([
    { id: 'sess_1', workspace_id: 'ws_1', title: 'Station review', state: 'idle' },
  ]);
  mocks.repository.allSessions.mockResolvedValue([
    { id: 'sess_1', workspace_id: 'ws_1', title: 'Station review', state: 'idle' },
  ]);
});

describe('useWorkspaceData stream ownership', () => {
  it('keeps the focused-session stream open between turns', async () => {
    mocks.repository.capabilities.mockResolvedValue({ capabilities: {}, gact_versions: ['0.3'] });
    const idle = renderWorkspaceData();

    await waitFor(() =>
      expect(mocks.useSessionLiveStream).toHaveBeenLastCalledWith(
        expect.objectContaining({ enabled: true, sessionId: 'sess_1' }),
      ),
    );
    idle.unmount();
  });
});

describe('useWorkspaceData interaction reads', () => {
  it('keeps answering pending approvals while the capability read is failing', async () => {
    mocks.repository.capabilities.mockRejectedValue(new Error('capabilities unavailable'));
    mocks.repository.pendingApprovals.mockResolvedValue([approval]);

    const { result } = renderWorkspaceData();

    await waitFor(() => expect(result.current.interactions).toHaveLength(1));
    expect(result.current.interactions[0]).toMatchObject({
      id: 'perm_1',
      kind: 'permission',
      owner_session_id: 'sess_1',
    });
    expect(mocks.repository.pendingInteractionProjection).not.toHaveBeenCalled();
  });

  it('reports a failed capability read as a degradation, not a failed response read', async () => {
    mocks.repository.capabilities.mockRejectedValue(new Error('capabilities unavailable'));

    const { result } = renderWorkspaceData();

    await waitFor(() =>
      expect(result.current.interactionCapabilityError?.message).toBe('capabilities unavailable'),
    );
    // The legacy ledgers still answer, so the responses were read. Reporting
    // this as `interactionsError` told the reader their pending responses could
    // not be read when in fact every one of them was listed and answerable.
    expect(result.current.interactionsError).toBeUndefined();
  });

  it('reads the legacy ledgers before the capability read resolves', async () => {
    let resolveCapabilities: ((value: unknown) => void) | undefined;
    mocks.repository.capabilities.mockReturnValue(
      new Promise((resolve) => {
        resolveCapabilities = resolve;
      }),
    );
    mocks.repository.pendingApprovals.mockResolvedValue([approval]);

    const { result } = renderWorkspaceData();

    await waitFor(() => expect(result.current.interactions).toHaveLength(1));
    resolveCapabilities?.({ capabilities: {}, gact_versions: [] });
  });

  it('uses the unified read once the capability is advertised', async () => {
    mocks.repository.capabilities.mockResolvedValue({
      capabilities: { x_clio_interactions: true },
      gact_versions: [],
    });
    mocks.repository.pendingApprovals.mockResolvedValue([approval]);
    mocks.repository.pendingInteractionProjection.mockResolvedValue({ interactions: [
      {
        id: 'interaction_1',
        kind: 'question',
        owner_session_id: 'sess_1',
        attended_session_id: 'sess_1',
        status: 'pending',
        title: 'Question from agent',
        source: { protocol: 'native' },
        created_at: '2026-09-02T00:00:00Z',
      },
    ], degradations: [] });

    const { result } = renderWorkspaceData();

    await waitFor(() => expect(result.current.supportsUnifiedInteractions).toBe(true));
    // The legacy ledger stops contributing rows the moment the normalized read
    // owns them, so an approval served by both surfaces is never listed twice.
    await waitFor(() => expect(result.current.interactions).toHaveLength(1));
    expect(result.current.interactions[0]?.id).toBe('interaction_1');
  });

  it('shows a typed partial-read notice from the unified interaction projection', async () => {
    mocks.repository.capabilities.mockResolvedValue({
      capabilities: { x_clio_interactions: true },
      gact_versions: [],
    });
    mocks.repository.pendingInteractionProjection.mockResolvedValue({
      interactions: [],
      degradations: [{ reason: 'clio_core_segments_invalid', detail: 'One session could not be read' }],
    });
    const { result } = renderWorkspaceData();
    await waitFor(() =>
      expect(result.current.interactionsError?.message).toContain('damaged data record'),
    );
  });

  it('keeps a damaged background session notice out of an unrelated clean session', async () => {
    mocks.repository.capabilities.mockResolvedValue({
      capabilities: { x_clio_interactions: true },
      gact_versions: [],
    });
    const sessions = [
      { id: 'sess_1', workspace_id: 'ws_1', title: 'Current', state: 'idle' },
      { id: 'sess_2', workspace_id: 'ws_1', title: 'Older', state: 'idle' },
    ];
    mocks.repository.sessions.mockResolvedValue(sessions);
    mocks.repository.allSessions.mockResolvedValue(sessions);
    mocks.repository.pendingInteractionProjection.mockImplementation(async (rootId: string) => ({
      interactions: [],
      degradations: rootId === 'sess_2'
        ? [{ reason: 'clio_core_segments_invalid', detail: 'Older record could not be read' }]
        : [],
    }));

    const { result } = renderWorkspaceData();
    await waitFor(() =>
      expect(mocks.repository.pendingInteractionProjection).toHaveBeenCalledWith(
        'sess_2', true, expect.anything(),
      ),
    );
    expect(result.current.interactionsError).toBeUndefined();
  });
});

describe('useWorkspaceData artifact reads', () => {
  it('enriches registry heads without dropping historical transcript result versions', async () => {
    const historical = {
      id: 'artifact_previous',
      session_id: 'sess_1',
      workspace_id: 'ws_1',
      name: 'report.md',
      media_type: 'text/markdown',
      uri: 'artifact://ws_1/report.md@v0',
      created_at: '2026-09-04T00:00:00Z',
    };
    mocks.repository.transcript.mockResolvedValue({
      messages: [],
      tools: [],
      tasks: [],
      subagents: [],
      surfaces: [],
      artifacts: [historical],
    });
    mocks.repository.sessionArtifacts.mockResolvedValue({
      artifacts: [
        {
          workspace_id: 'ws_1',
          name: 'report.md',
          kind: 'report',
          latest_version: 1,
          head_artifact_id: 'artifact_report',
          aliases: { latest: 1 },
          versions: [
            {
              artifact_id: 'artifact_live_previous',
              workspace_id: 'ws_1',
              name: 'report.md',
              version: 0,
              kind: 'report',
              custody: 'cas',
              mechanism: 'tool-schema',
              evidence_class: 'hashed-at-use',
              created_at: '2026-09-04T12:00:00Z',
              producer: {},
              uri: 'artifact://ws_1/report.md@v0',
              fetch_url: '/v1/artifacts/artifact_live_previous/bytes',
            },
            {
              artifact_id: 'artifact_report',
              workspace_id: 'ws_1',
              name: 'report.md',
              version: 1,
              kind: 'report',
              custody: 'cas',
              mechanism: 'tool-schema',
              evidence_class: 'hashed-at-use',
              sha256: 'abc123',
              size_bytes: 128,
              path: 'D:\\workspace\\report.md',
              created_at: '2026-09-05T00:00:00Z',
              producer: {},
              uri: 'artifact://ws_1/report.md@v1',
              fetch_url: '/v1/artifacts/artifact_report/bytes',
            },
          ],
          producing_session_ids: ['sess_1'],
        },
      ],
      used: [],
      count: 1,
      include_children: true,
      child_session_ids: [],
    });

    renderWorkspaceData();

    await waitFor(() =>
      expect(mocks.mergeSnapshots).toHaveBeenCalledWith({
        artifacts: {
          artifact_previous: historical,
          artifact_live_previous: expect.objectContaining({
            id: 'artifact_live_previous',
            fetch_path: '/v1/artifacts/artifact_live_previous/bytes',
          }),
          artifact_report: expect.objectContaining({
            id: 'artifact_report',
            name: 'report.md',
            session_id: 'sess_1',
          }),
        },
      }),
    );
  });
});

describe('useWorkspaceData files query', () => {
  it('sends include_hidden=true by default (the toggle is off)', async () => {
    renderWorkspaceData();

    await waitFor(() =>
      expect(mocks.repository.workspaceFiles).toHaveBeenCalledWith(
        'ws_1',
        expect.any(AbortSignal),
        { includeHidden: true },
      ),
    );
  });

  it('sends include_hidden=false to the server when "Hide dot files and folders" is on', async () => {
    // The toggle must reach the SERVER (include_hidden), not filter client-side
    // after the shared entry cap already paid for the discarded entries.
    mocks.useAppearancePreferences.mockReturnValue({ hideDotFiles: true });

    renderWorkspaceData();

    await waitFor(() =>
      expect(mocks.repository.workspaceFiles).toHaveBeenCalledWith(
        'ws_1',
        expect.any(AbortSignal),
        { includeHidden: false },
      ),
    );
  });

  // Owner decision: the server-side workspace.files.changed watcher produced
  // an event storm and was dropped. Polling replaces it, scoped to exactly
  // when someone could see a stale listing.
  describe('polling (replaces the dropped live-event trigger)', () => {
    beforeEach(() => {
      vi.useFakeTimers();
    });

    afterEach(() => {
      vi.useRealTimers();
    });

    it('polls every 5s while the Files view is the active tab', async () => {
      renderWorkspaceData({ filesViewActive: true });
      await vi.waitFor(() => expect(mocks.repository.workspaceFiles).toHaveBeenCalledTimes(1));

      await act(async () => {
        await vi.advanceTimersByTimeAsync(5_000);
      });
      expect(mocks.repository.workspaceFiles.mock.calls.length).toBeGreaterThanOrEqual(2);

      await act(async () => {
        await vi.advanceTimersByTimeAsync(5_000);
      });
      expect(mocks.repository.workspaceFiles.mock.calls.length).toBeGreaterThanOrEqual(3);
    });

    it('does not poll while the Files view is not the active tab', async () => {
      renderWorkspaceData({ filesViewActive: false });
      await vi.waitFor(() => expect(mocks.repository.workspaceFiles).toHaveBeenCalledTimes(1));

      await act(async () => {
        await vi.advanceTimersByTimeAsync(20_000);
      });
      // Only the one mount-triggered fetch -- no interval fired.
      expect(mocks.repository.workspaceFiles).toHaveBeenCalledTimes(1);
    });

    it('stops polling once the query observer unmounts', async () => {
      const { unmount } = renderWorkspaceData({ filesViewActive: true });
      await vi.waitFor(() => expect(mocks.repository.workspaceFiles).toHaveBeenCalledTimes(1));

      unmount();
      const callsAtUnmount = mocks.repository.workspaceFiles.mock.calls.length;

      await act(async () => {
        await vi.advanceTimersByTimeAsync(20_000);
      });
      expect(mocks.repository.workspaceFiles.mock.calls.length).toBe(callsAtUnmount);
    });
  });
});

describe('useWorkspaceData active provider identity (#1418)', () => {
  it('resolves activeProvider from provider_id, never the shared wire kind', async () => {
    // The configured provider is llama_cpp, whose wire kind is "openai" --
    // nine presets share that kind. Before the fix, activeProvider read
    // `modelConfiguration.data?.provider` (the kind) instead of
    // `?.provider_id`, so it resolved to "openai" rather than "llama_cpp".
    mocks.repository.languageModelConfiguration.mockResolvedValue({
      configured: true,
      provider_id: 'llama_cpp',
      provider: 'openai',
      api_base: 'http://127.0.0.1:8090/v1',
      model: 'qwen3-4b-instruct-gguf',
      presets: [
        {
          id: 'bedrock',
          label: 'Amazon Bedrock',
          provider: 'openai',
          requires_api_key: false,
          is_authenticated: false,
          supports_live_catalog: true,
          supports_vision: true,
        },
        {
          id: 'llama_cpp',
          label: 'llama.cpp server',
          provider: 'openai',
          requires_api_key: false,
          is_authenticated: true,
          supports_live_catalog: true,
          supports_vision: true,
        },
      ],
    });

    const { result } = renderWorkspaceData();

    await waitFor(() => expect(result.current.activeProvider).toBe('llama_cpp'));
    expect(result.current.activeProvider).not.toBe('openai');
  });
});

describe('useWorkspaceData requested session lookup', () => {
  const sessionOne = { id: 'sess_1', workspace_id: 'ws_1', title: 'Station review', state: 'idle' };
  const sessionTwo = { id: 'sess_2', workspace_id: 'ws_1', title: 'Made elsewhere', state: 'idle' };

  it('refetches a stale session list instead of reporting a session created elsewhere as missing', async () => {
    const { result, rerender } = renderHook(
      ({ sessionId }: { sessionId: string }) =>
        useWorkspaceData({ contextTargetId: sessionId, sessionId, workspaceId: 'ws_1' }),
      { initialProps: { sessionId: 'sess_1' }, wrapper },
    );
    await waitFor(() => expect(result.current.session?.id).toBe('sess_1'));
    const fetchesBefore = mocks.repository.sessions.mock.calls.length;

    // Another tab, the CLI or an agent creates a conversation; the route moves
    // to it while the cached list for this workspace predates it.
    mocks.repository.sessions.mockResolvedValue([sessionOne, sessionTwo]);
    rerender({ sessionId: 'sess_2' });

    expect(result.current.session).toBeUndefined();
    expect(result.current.sessionLookupPending).toBe(true);
    await waitFor(() => expect(result.current.session?.id).toBe('sess_2'));
    expect(result.current.sessionLookupPending).toBe(false);
    expect(mocks.repository.sessions.mock.calls.length).toBeGreaterThan(fetchesBefore);
  });

  it('reports a session the service really does not have once a fresh list confirms it', async () => {
    const { result } = renderHook(
      () =>
        useWorkspaceData({
          contextTargetId: 'sess_gone',
          sessionId: 'sess_gone',
          workspaceId: 'ws_1',
        }),
      { wrapper },
    );

    await waitFor(() => expect(result.current.sessionLookupPending).toBe(false));
    expect(result.current.session).toBeUndefined();
    expect(mocks.repository.sessions.mock.calls.length).toBe(2);
  });
});

describe('useWorkspaceData transcript recovery', () => {
  it('fetches the completed answer when the initial transcript missed the final stream frame', async () => {
    mocks.repository.sessions.mockResolvedValue([
      {
        id: 'sess_1',
        workspace_id: 'ws_1',
        title: 'Station review',
        state: 'completed',
        updated_at: '2026-10-02T04:30:00Z',
        message_count: 2,
      },
    ]);
    const snapshot = (ids: string[]): TranscriptSnapshot => ({
      messages: ids.map((id) => ({
        id,
        session_id: 'sess_1',
        role: id === 'assistant' ? 'assistant' : 'user',
        created_at: '2026-10-02T04:30:00Z',
        blocks: [],
      })) as TranscriptSnapshot['messages'],
      tools: [],
      tasks: [],
      subagents: [],
      artifacts: [],
      surfaces: [],
    });
    mocks.repository.transcript
      .mockResolvedValueOnce(snapshot(['user']))
      .mockResolvedValue(snapshot(['user', 'assistant']));

    renderWorkspaceData();

    await waitFor(() => expect(mocks.repository.transcript).toHaveBeenCalledTimes(2));
    expect(mocks.mergeSnapshots).toHaveBeenCalledWith(
      expect.objectContaining({ messages: expect.objectContaining({ assistant: expect.anything() }) }),
    );
  });
});

describe('useWorkspaceData background polls', () => {
  it('does not re-render the workspace when a poll returns the same data', async () => {
    mocks.repository.pendingApprovals.mockResolvedValue([approval]);
    const client = new QueryClient({
      defaultOptions: { mutations: { retry: false }, queries: { retry: false } },
    });
    let renders = 0;
    const { result } = renderHook(
      () => {
        renders += 1;
        return useWorkspaceData({
          contextTargetId: 'sess_1',
          sessionId: 'sess_1',
          workspaceId: 'ws_1',
        });
      },
      {
        wrapper: ({ children }: { children: ReactNode }) => (
          <QueryClientProvider client={client}>{children}</QueryClientProvider>
        ),
      },
    );
    await waitFor(() => expect(result.current.interactions).toHaveLength(1));
    // Let every initial read settle before counting.
    await waitFor(() => expect(client.isFetching()).toBe(0));
    const settled = renders;

    // The polled reads tick (same payloads): the fetchStatus flips must not
    // re-render the page that consumes them.
    await act(async () => {
      await Promise.all([
        client.refetchQueries({ queryKey: ['pending-approvals'] }),
        client.refetchQueries({ queryKey: ['pending-questions'] }),
        client.refetchQueries({ queryKey: ['sessions', 'http://127.0.0.1:8790', 'ws_1'] }),
      ]);
      // Query notifications are delivered on a later macrotask.
      await new Promise((resolve) => setTimeout(resolve, 20));
    });

    expect(mocks.repository.pendingApprovals.mock.calls.length).toBeGreaterThan(1);
    expect(renders).toBe(settled);
  });
});
