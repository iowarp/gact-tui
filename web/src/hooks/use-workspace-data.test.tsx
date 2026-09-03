import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { cleanup, renderHook, waitFor } from '@testing-library/react';
import type { ReactNode } from 'react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

const mocks = vi.hoisted(() => {
  const capabilityError = new Error('capability route unavailable');
  return {
    capabilityError,
    repository: {
      agentBlueprints: vi.fn(async () => []),
      allSessions: vi.fn(),
      pendingApprovals: vi.fn(),
      pendingInteractions: vi.fn(async () => []),
      pendingQuestions: vi.fn(),
      providerCatalog: vi.fn(async () => ({ providers: [] })),
      resources: vi.fn(async () => []),
      sessionArtifacts: vi.fn(async () => ({ artifacts: [], used: [] })),
      sessions: vi.fn(),
      transcript: vi.fn(),
      workspaceFiles: vi.fn(async () => []),
      workspaces: vi.fn(),
    },
  };
});

vi.mock('./use-repository', () => ({ useRepository: () => mocks.repository }));
vi.mock('./use-workspace-capabilities', () => ({
  useWorkspaceCapabilities: () => ({
    capabilities: { data: undefined, error: mocks.capabilityError, isError: true },
    modelConfiguration: { data: { presets: [] } },
  }),
}));
vi.mock('./use-session-live-stream', () => ({ useSessionLiveStream: () => undefined }));
vi.mock('./use-session-context', () => ({ useSessionContext: () => ({ state: {} }) }));
vi.mock('./use-session-observability', () => ({
  useSessionObservability: () => ({
    contextFiles: { data: [] },
    contextFrames: { data: [] },
    diffs: { data: [] },
    processes: { data: [] },
  }),
}));
vi.mock('./use-execution-provenance', () => ({
  useExecutionProvenance: () => ({
    execution: {},
    providers: {},
  }),
}));
vi.mock('@/providers/connection-provider', () => ({
  useConnectionSettings: () => ({ settings: { endpoint: 'http://127.0.0.1:8788' } }),
}));

import { useWorkspaceData } from './use-workspace-data';

const session = {
  id: 'sess_root',
  workspace_id: 'ws_1',
  title: 'Root task',
  state: 'running',
  created_at: '2026-09-03T00:00:00Z',
  updated_at: '2026-09-03T00:00:00Z',
  mode: 'edit',
  edit_mode: 'diff',
  routing_mode: 'auto',
  approval_mode: 'ask',
  pinned: false,
  archived: false,
};

beforeEach(() => {
  vi.clearAllMocks();
  mocks.repository.workspaces.mockResolvedValue([{ id: 'ws_1', display_name: 'Workspace' }]);
  mocks.repository.sessions.mockResolvedValue([session]);
  mocks.repository.allSessions.mockResolvedValue([session]);
  mocks.repository.transcript.mockResolvedValue({
    artifacts: [],
    cursor: '',
    messages: [],
    subagents: [],
    surfaces: [],
    tasks: [],
    tools: [],
  });
  mocks.repository.pendingApprovals.mockResolvedValue([
    {
      id: 'perm_1',
      session_id: session.id,
      tool_name: 'shell.exec',
      summary: 'Run command',
      status: 'pending',
      created_at: '2026-09-03T00:00:00Z',
    },
  ]);
  mocks.repository.pendingQuestions.mockResolvedValue([
    {
      id: 'question_1',
      session_id: session.id,
      prompt: 'Choose a source',
      status: 'pending',
      kind: 'text',
      options: [],
      created_at: '2026-09-03T00:00:00Z',
      updated_at: '2026-09-03T00:00:00Z',
    },
  ]);
});

afterEach(cleanup);

describe('useWorkspaceData interaction fallback', () => {
  it('keeps legacy questions and permissions visible when capability negotiation fails', async () => {
    const client = new QueryClient({
      defaultOptions: { queries: { retry: false } },
    });
    const wrapper = ({ children }: { children: ReactNode }) => (
      <QueryClientProvider client={client}>{children}</QueryClientProvider>
    );

    const { result } = renderHook(
      () =>
        useWorkspaceData({
          contextTargetId: session.id,
          sessionId: session.id,
          workspaceId: session.workspace_id,
        }),
      { wrapper },
    );

    await waitFor(() => expect(result.current.interactions).toHaveLength(2));
    expect(result.current.interactions.map((interaction) => interaction.id)).toEqual([
      'perm_1',
      'question_1',
    ]);
    expect(result.current.interactionCapabilityError).toBe(mocks.capabilityError);
    expect(mocks.repository.pendingApprovals).toHaveBeenCalled();
    expect(mocks.repository.pendingQuestions).toHaveBeenCalled();
    expect(mocks.repository.pendingInteractions).not.toHaveBeenCalled();
    client.clear();
  });
});
