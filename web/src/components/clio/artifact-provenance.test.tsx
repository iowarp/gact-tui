import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { cleanup, render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { ArtifactProvenance } from './artifact-provenance';

const repository = vi.hoisted(() => ({
  artifactDetail: vi.fn().mockResolvedValue({
    artifact: {
      workspace_id: 'ws_1',
      name: 'result.csv',
      kind: 'data',
      latest_version: 2,
      head_artifact_id: 'artifact_2',
      aliases: { latest: 2, reviewed: 1 },
      versions: [
        {
          artifact_id: 'artifact_1',
          workspace_id: 'ws_1',
          name: 'result.csv',
          version: 1,
          kind: 'data',
          custody: 'workspace-referenced',
          mechanism: 'tool-declared',
          evidence_class: 'declared',
          created_at: '2026-08-23T00:00:00Z',
          producer: { call_id: 'call_1' },
          uri: 'artifact://ws_1/result.csv@v1',
          fetch_url: '/v1/artifacts/artifact_1/bytes',
        },
        {
          artifact_id: 'artifact_2',
          workspace_id: 'ws_1',
          name: 'result.csv',
          version: 2,
          kind: 'data',
          custody: 'cas',
          mechanism: 'tool-declared',
          evidence_class: 'verified',
          created_at: '2026-08-23T00:01:00Z',
          producer: { call_id: 'call_2' },
          prior_version: 1,
          uri: 'artifact://ws_1/result.csv@v2',
          fetch_url: '/v1/artifacts/artifact_2/bytes',
        },
      ],
    },
    resolved: { artifact_id: 'artifact_2' },
  }),
  artifactLineage: vi.fn().mockResolvedValue({
    root: 'artifact_2',
    direction: 'both',
    depth: 5,
    nodes: [
      { id: 'artifact_2', type: 'artifact', name: 'result.csv', version: 2, kind: 'data' },
      { id: 'activity:call_2', type: 'activity', tool: 'Build report', status: 'ok' },
    ],
    edges: [
      {
        from: 'activity:call_2',
        to: 'artifact_2',
        type: 'generated',
        evidence: 'declared',
      },
    ],
  }),
  executionProvenance: vi.fn().mockResolvedValue({
    schema_version: 'clio.execution_provenance.v1',
    provider: 'native',
    session_id: 'sess_1',
    root_session_id: 'sess_1',
    complete: true,
    truncated: false,
    provider_health: {},
    campaigns: [],
    workflows: [],
    agents: [],
    spans: [],
    nodes: [],
    edges: [],
  }),
  exportArtifact: vi.fn(),
}));

vi.mock('@/hooks/use-repository', () => ({ useRepository: () => repository }));
vi.mock('@/providers/connection-provider', () => ({
  useConnectionSettings: () => ({ settings: { endpoint: 'http://127.0.0.1:8790' } }),
}));

afterEach(() => {
  cleanup();
  vi.clearAllMocks();
});

describe('ArtifactProvenance', () => {
  it('shows immutable versions and the authoritative lineage without raw JSON', async () => {
    const queryClient = new QueryClient({ defaultOptions: { queries: { retry: false } } });
    const versions = render(
      <QueryClientProvider client={queryClient}>
        <ArtifactProvenance
          artifact={{
            id: 'artifact_2',
            session_id: 'sess_1',
            name: 'result.csv',
            media_type: 'text/csv',
            uri: 'artifact://ws_1/result.csv@v2',
          }}
        />
      </QueryClientProvider>,
    );

    expect(await screen.findByText('Version 1')).toBeVisible();
    expect(screen.getByText('Version 2')).toBeVisible();
    expect(screen.getByText('Latest')).toBeVisible();
    versions.unmount();
    render(
      <QueryClientProvider
        client={new QueryClient({ defaultOptions: { queries: { retry: false } } })}
      >
        <ArtifactProvenance
          artifact={{
            id: 'artifact_2',
            session_id: 'sess_1',
            name: 'result.csv',
            media_type: 'text/csv',
            uri: 'artifact://ws_1/result.csv@v2',
          }}
          view="lineage"
        />
      </QueryClientProvider>,
    );
    expect(await screen.findByText('Build report')).toBeInTheDocument();
    expect(screen.getByLabelText('Artifact lineage graph')).toBeVisible();
    expect(repository.artifactLineage).toHaveBeenCalledWith(
      'artifact_2',
      { direction: 'both', depth: 5 },
      expect.any(AbortSignal),
    );
    expect(document.body).not.toHaveTextContent('"nodes"');
  });

  it('keys custody reads to the connected service', async () => {
    const queryClient = new QueryClient({ defaultOptions: { queries: { retry: false } } });
    render(
      <QueryClientProvider client={queryClient}>
        <ArtifactProvenance
          artifact={{
            id: 'artifact_2',
            session_id: 'sess_1',
            name: 'result.csv',
            media_type: 'text/csv',
            uri: 'artifact://ws_1/result.csv@v2',
          }}
        />
      </QueryClientProvider>,
    );

    expect(await screen.findByText('Version 1')).toBeVisible();
    expect(
      queryClient
        .getQueryCache()
        .findAll()
        .map((query) => query.queryKey),
    ).toContainEqual(['artifact-detail', 'http://127.0.0.1:8790', 'artifact_2']);
  });

  it('keeps service errors behind plain-language provenance states', async () => {
    repository.artifactDetail.mockRejectedValueOnce(
      new Error('artifact not found: artifact_internal_123'),
    );
    repository.artifactLineage.mockRejectedValueOnce(
      new Error('lineage index missing for artifact_internal_123'),
    );
    const user = userEvent.setup();
    const queryClient = new QueryClient({ defaultOptions: { queries: { retry: false } } });
    const versions = render(
      <QueryClientProvider client={queryClient}>
        <ArtifactProvenance
          artifact={{
            id: 'artifact_internal_123',
            session_id: 'sess_1',
            name: 'historical.json',
            media_type: 'application/json',
            uri: 'artifact://historical.json',
          }}
        />
      </QueryClientProvider>,
    );

    expect(await screen.findByText('Version history unavailable')).toBeVisible();
    expect(screen.getByText(/saved content remains readable/i)).toBeVisible();
    expect(screen.getByText('artifact not found: artifact_internal_123')).not.toBeVisible();
    await user.click(screen.getByText('Technical details'));
    expect(screen.getByText('artifact not found: artifact_internal_123')).toBeVisible();
    versions.unmount();
    render(
      <QueryClientProvider
        client={new QueryClient({ defaultOptions: { queries: { retry: false } } })}
      >
        <ArtifactProvenance
          artifact={{
            id: 'artifact_internal_123',
            session_id: 'sess_1',
            name: 'historical.json',
            media_type: 'application/json',
            uri: 'artifact://historical.json',
          }}
          view="lineage"
        />
      </QueryClientProvider>,
    );
    expect(await screen.findByText('Declared evidence index unavailable')).toBeVisible();
    expect(screen.getByText('lineage index missing for artifact_internal_123')).not.toBeVisible();
  });

  it('keeps research execution visible when the declared evidence index is unavailable', async () => {
    repository.artifactLineage.mockRejectedValueOnce(new Error('artifact registry is rebuilding'));
    repository.executionProvenance.mockResolvedValueOnce({
      schema_version: 'clio.execution_provenance.v1',
      provider: 'native',
      session_id: 'sess_1',
      root_session_id: 'sess_1',
      complete: true,
      truncated: false,
      provider_health: {},
      campaigns: [],
      workflows: [],
      agents: [],
      session_lineage: [],
      spans: [
        {
          id: 'artifact-created',
          parent_id: '',
          kind: 'artifact',
          session_id: 'sess_1',
          workflow_id: '',
          campaign_id: '',
          agent_id: '',
          source_agent_id: '',
          label: 'Artifact created',
          event_type: 'artifact.created',
          status: 'completed',
          start_time: 2,
          end_time: 2,
          duration_ms: 0,
          host: '',
          artifact_refs: [{ artifact_id: 'artifact_2', sha256: 'a'.repeat(64) }],
          attributes: {},
          source_event_ids: ['artifact-created'],
        },
      ],
      nodes: [
        {
          id: 'session:sess_1',
          kind: 'session',
          label: 'Research session',
          status: 'completed',
          session_id: 'sess_1',
          agent_id: '',
          start_time: null,
          end_time: null,
          attributes: {},
        },
        {
          id: 'tool:fetch',
          kind: 'tool',
          label: 'researcher model action 1: web_fetch',
          status: 'completed',
          session_id: 'sess_1',
          agent_id: 'researcher',
          start_time: 1,
          end_time: 1,
          attributes: {
            tool_name: 'web_fetch',
            tool_input: { target: 'https://example.test/paper.pdf' },
          },
        },
        {
          id: 'artifact:artifact_2',
          kind: 'artifact',
          label: 'result.csv',
          status: 'available',
          session_id: 'sess_1',
          agent_id: '',
          start_time: null,
          end_time: null,
          attributes: { artifact_id: 'artifact_2' },
        },
      ],
      edges: [
        { id: 'contains', source: 'session:sess_1', target: 'tool:fetch', kind: 'contains' },
        {
          id: 'generated',
          source: 'session:sess_1',
          target: 'artifact:artifact_2',
          kind: 'generated',
        },
      ],
    });
    render(
      <QueryClientProvider
        client={new QueryClient({ defaultOptions: { queries: { retry: false } } })}
      >
        <ArtifactProvenance
          artifact={{
            id: 'artifact_2',
            session_id: 'sess_1',
            name: 'result.csv',
            media_type: 'text/csv',
            uri: 'artifact://result.csv',
          }}
          view="lineage"
        />
      </QueryClientProvider>,
    );

    expect(await screen.findByText('Declared evidence index unavailable')).toBeVisible();
    expect(await screen.findByText('Research execution')).toBeVisible();
    expect(screen.getByText('Fetch target')).toBeInTheDocument();
    expect(repository.executionProvenance).toHaveBeenCalledWith(
      'sess_1',
      { provider: 'native', includeChildren: true, limit: 10_000 },
      expect.any(AbortSignal),
    );
  });
});
