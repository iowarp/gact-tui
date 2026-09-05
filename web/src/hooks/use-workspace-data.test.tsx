import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { renderHook, waitFor } from '@testing-library/react';
import type { ReactNode } from 'react';
import { beforeEach, describe, expect, it, vi } from 'vitest';

const mocks = vi.hoisted(() => ({
  mergeSnapshots: vi.fn(),
  repository: {
    agentBlueprints: vi.fn(async () => []),
    allSessions: vi.fn(async () => [] as unknown[]),
    capabilities: vi.fn(async () => ({}) as unknown),
    languageModelConfiguration: vi.fn(async () => ({ presets: [] })),
    pendingApprovals: vi.fn(async () => [] as unknown[]),
    pendingInteractions: vi.fn(async () => [] as unknown[]),
    pendingQuestions: vi.fn(async () => [] as unknown[]),
    providerCatalog: vi.fn(async () => ({ providers: [] })),
    providerModels: vi.fn(async () => ({ models: [] })),
    resources: vi.fn(async () => []),
    sessionArtifacts: vi.fn(async () => ({ artifacts: [], used: [] })),
    sessions: vi.fn(async () => [] as unknown[]),
    transcript: vi.fn(async () => ({
      messages: [],
      tools: [],
      tasks: [],
      subagents: [],
      artifacts: [],
      surfaces: [],
    })),
    workspaceFiles: vi.fn(async () => []),
    workspaces: vi.fn(async () => []),
  },
}));

vi.mock('@/providers/connection-provider', () => ({
  useConnectionSettings: () => ({ settings: { endpoint: 'http://127.0.0.1:8790' } }),
}));
vi.mock('./use-repository', () => ({ useRepository: () => mocks.repository }));
vi.mock('./use-session-live-stream', () => ({ useSessionLiveStream: () => undefined }));
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

function renderWorkspaceData() {
  return renderHook(
    () => useWorkspaceData({ contextTargetId: 'sess_1', sessionId: 'sess_1', workspaceId: 'ws_1' }),
    { wrapper },
  );
}

beforeEach(() => {
  vi.clearAllMocks();
  mocks.repository.capabilities.mockResolvedValue({ capabilities: {}, gact_versions: [] });
  mocks.repository.pendingApprovals.mockResolvedValue([]);
  mocks.repository.pendingQuestions.mockResolvedValue([]);
  mocks.repository.pendingInteractions.mockResolvedValue([]);
  mocks.repository.sessions.mockResolvedValue([
    { id: 'sess_1', workspace_id: 'ws_1', title: 'Station review', state: 'idle' },
  ]);
  mocks.repository.allSessions.mockResolvedValue([
    { id: 'sess_1', workspace_id: 'ws_1', title: 'Station review', state: 'idle' },
  ]);
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
    expect(mocks.repository.pendingInteractions).not.toHaveBeenCalled();
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
    mocks.repository.pendingInteractions.mockResolvedValue([
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
    ]);

    const { result } = renderWorkspaceData();

    await waitFor(() => expect(result.current.supportsUnifiedInteractions).toBe(true));
    // The legacy ledger stops contributing rows the moment the normalized read
    // owns them, so an approval served by both surfaces is never listed twice.
    await waitFor(() => expect(result.current.interactions).toHaveLength(1));
    expect(result.current.interactions[0]?.id).toBe('interaction_1');
  });
});

describe('useWorkspaceData artifact reads', () => {
  it('merges registry artifacts so transcript resource links resolve after a task completes', async () => {
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
