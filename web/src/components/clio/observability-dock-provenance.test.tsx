// Governed presentation fallbacks, session status, canvas duration/wait, and
// artifact/source provenance ownership live in `observability-dock.test.tsx`;
// this file covers empty/failed section states, provenance provider
// switching and degradation, and transcript-causality ordering.
import type { AsyncProcess, ExecutionProvenanceResult } from '@clio/core/v3';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { cleanup, render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { ClioObservabilityView } from './observability-dock';

beforeEach(() => {
  Object.defineProperty(URL, 'createObjectURL', {
    configurable: true,
    value: vi.fn(() => 'blob:artifact-preview'),
  });
  Object.defineProperty(URL, 'revokeObjectURL', {
    configurable: true,
    value: vi.fn(() => undefined),
  });
});

afterEach(() => {
  cleanup();
  Reflect.deleteProperty(URL, 'createObjectURL');
  Reflect.deleteProperty(URL, 'revokeObjectURL');
});

function renderObservability(children: React.ReactNode) {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  return render(<QueryClientProvider client={client}>{children}</QueryClientProvider>);
}

describe('ClioObservabilityView provenance and section states', () => {
  it('distinguishes a failed observability section from an empty one', async () => {
    const user = userEvent.setup();
    renderObservability(
      <ClioObservabilityView
        artifacts={[]}
        contextFiles={[]}
        contextFrames={[]}
        diffs={[]}
        diffsError="The service could not read session diffs: 500"
        messages={[]}
        processes={[]}
        processesError="The service could not read background work: 500"
        runs={[]}
        subagents={[]}
        tasks={[]}
        tools={[]}
      />,
    );

    await user.click(screen.getByRole('tab', { name: 'Gantt' }));
    expect(screen.getByText('Background work unavailable')).toBeVisible();
    await user.click(screen.getByRole('tab', { name: 'Evidence' }));
    expect(screen.getByText('File changes unavailable')).toBeVisible();
  });

  it('labels containing-turn placement inline without a global timing warning', async () => {
    const user = userEvent.setup();
    renderObservability(
      <ClioObservabilityView
        artifacts={[]}
        contextFiles={[]}
        contextFrames={[]}
        diffs={[]}
        messages={[
          {
            id: 'message_1',
            session_id: 'sess_1',
            role: 'assistant',
            created_at: '2026-08-22T12:00:00Z',
            blocks: [{ id: 'block_1', type: 'tool', tool_id: 'tool_1' }],
          },
        ]}
        processes={[]}
        runs={[]}
        subagents={[]}
        tasks={[]}
        tools={[
          {
            id: 'tool_1',
            session_id: 'sess_1',
            name: 'campaign_health',
            title: 'Campaign health',
            state: 'succeeded',
          },
        ]}
      />,
    );

    await user.click(screen.getByRole('tab', { name: 'Timeline' }));
    expect(
      screen.queryByText(/exact tool execution times were not recorded/i),
    ).not.toBeInTheDocument();
    expect(screen.getByText('Campaign health')).toBeVisible();
    expect(screen.queryByText('Time unavailable')).not.toBeInTheDocument();
    expect(screen.getByTitle('Observed in its containing turn')).toHaveTextContent('In this turn');
  });

  it('switches authoritative provenance providers and exposes artifact custody', async () => {
    const user = userEvent.setup();
    const onProviderChange = vi.fn();
    renderObservability(
      <ClioObservabilityView
        artifactProvenanceProvider={{
          provider: 'cmf',
          queryable: true,
          durable: true,
          status: 'ready',
          health: {},
        }}
        artifacts={[]}
        contextFiles={[]}
        contextFrames={[]}
        diffs={[]}
        messages={[]}
        onProvenanceProviderChange={onProviderChange}
        processes={[]}
        provenanceProvider="native"
        provenanceProviders={[
          {
            name: 'native',
            configured: true,
            queryable: true,
            durable: true,
            status: 'ready',
            source: 'clio',
            health: {},
          },
          {
            name: 'flowcept',
            configured: true,
            queryable: true,
            durable: false,
            status: 'ready',
            source: 'flowcept',
            health: {},
          },
        ]}
        runs={[]}
        subagents={[]}
        tasks={[]}
        tools={[]}
      />,
    );

    await user.click(screen.getByRole('combobox', { name: 'Execution provenance provider' }));
    await user.click(screen.getByRole('option', { name: /flowcept/u }));
    expect(onProviderChange).toHaveBeenCalledWith('flowcept');

    await user.click(screen.getByRole('tab', { name: 'Evidence' }));
    expect(screen.getByText('Provenance')).toBeVisible();
    expect(screen.getByText('Artifacts: cmf')).toBeVisible();
  });

  it('renders typed provenance degradation instead of an empty successful view', () => {
    renderObservability(
      <ClioObservabilityView
        artifacts={[]}
        contextFiles={[]}
        contextFrames={[]}
        diffs={[]}
        messages={[]}
        processes={[]}
        provenanceDegradation={{
          code: 'execution_provenance_partial',
          reason: 'Partial flowcept provenance: the provider marked the snapshot incomplete.',
          capability: 'execution_provenance',
          recoverable: true,
          provider: 'flowcept',
          partial: true,
        }}
        provenanceProvider="flowcept"
        provenanceProviders={[
          {
            name: 'flowcept',
            configured: true,
            queryable: true,
            durable: false,
            status: 'ready',
            source: 'flowcept',
            health: {},
          },
        ]}
        runs={[]}
        subagents={[]}
        tasks={[]}
        tools={[]}
      />,
    );

    expect(screen.getByText(/Partial flowcept provenance/u)).toBeVisible();
    expect(screen.getByRole('status', { name: 'flowcept provenance degraded' })).toBeVisible();
    expect(
      screen.queryByRole('status', { name: 'flowcept provenance ready' }),
    ).not.toBeInTheDocument();
  });

  it('still shows process activity when session_lineage is legally empty', async () => {
    // [] means "delegated to nothing", not a missing read — must still fall back.
    const user = userEvent.setup();
    const provenance: ExecutionProvenanceResult = {
      schema_version: 'clio.execution_provenance.v1',
      provider: 'native',
      session_id: 'session_root',
      complete: true,
      truncated: false,
      provider_health: {},
      campaigns: [],
      workflows: [],
      agents: [],
      session_lineage: [],
      spans: [],
      nodes: [],
      edges: [],
    };
    const process: AsyncProcess = {
      kind: 'agent',
      id: 'task_1',
      title: 'ndp #1',
      live_state: 'completed',
      status: 'completed',
      metadata: {},
    };
    renderObservability(
      <ClioObservabilityView
        artifacts={[]}
        contextFiles={[]}
        contextFrames={[]}
        diffs={[]}
        executionProvenance={provenance}
        messages={[]}
        processes={[process]}
        runs={[]}
        subagents={[]}
        tasks={[]}
        tools={[]}
      />,
    );

    await user.click(screen.getByRole('tab', { name: 'Timeline' }));
    expect(screen.getByText('ndp #1')).toBeVisible();
  });

  it('orders child branches, natural joins, wait, and collection by transcript causality', async () => {
    const user = userEvent.setup();
    const view = renderObservability(
      <ClioObservabilityView
        artifacts={[]}
        contextFiles={[]}
        contextFrames={[]}
        diffs={[]}
        executionProvenance={{
          schema_version: 'clio.execution_provenance.v1',
          provider: 'native',
          session_id: 'session_root',
          root_session_id: 'session_root',
          complete: true,
          truncated: false,
          provider_health: {},
          campaigns: [],
          workflows: [],
          agents: [],
          session_lineage: [
            {
              session_id: 'session_root',
              parent_session_id: '',
              task_id: '',
              agent_id: 'main',
              label: 'Main agent',
              depth: 0,
              task_path: [],
            },
            {
              session_id: 'session_a',
              parent_session_id: 'session_root',
              task_id: 'task_a',
              agent_id: 'researcher',
              label: 'Researcher A',
              depth: 1,
              task_path: ['task_a'],
              status: 'completed',
              created_at: '2026-09-09T12:00:01Z',
              updated_at: '2026-09-09T12:00:08Z',
            },
            {
              session_id: 'session_b',
              parent_session_id: 'session_root',
              task_id: 'task_b',
              agent_id: 'reviewer',
              label: 'Reviewer B',
              depth: 1,
              task_path: ['task_b'],
              status: 'completed',
              created_at: '2026-09-09T12:00:02Z',
              updated_at: '2026-09-09T12:00:05Z',
            },
          ],
          spans: [],
          nodes: [],
          edges: [],
        }}
        messages={[
          {
            id: 'message_1',
            session_id: 'session_root',
            role: 'assistant',
            created_at: '2026-09-09T12:00:00Z',
            blocks: [
              {
                id: 'started_a',
                type: 'subagent',
                subagent_id: 'task_a',
                stage: 'delegate.started',
                sequence: 1,
              },
              {
                id: 'started_b',
                type: 'subagent',
                subagent_id: 'task_b',
                stage: 'delegate.started',
                sequence: 2,
              },
              { id: 'wait', type: 'tool', tool_id: 'wait_call', sequence: 3 },
              { id: 'collect_b', type: 'tool', tool_id: 'collect_b_call', sequence: 4 },
              { id: 'collect_a', type: 'tool', tool_id: 'collect_a_call', sequence: 5 },
            ],
          },
        ]}
        processes={[]}
        runs={[]}
        subagents={[]}
        tasks={[]}
        tools={[
          {
            id: 'spawn_call',
            session_id: 'session_root',
            name: 'spawn_agents_parallel',
            state: 'succeeded',
          },
          {
            id: 'wait_call',
            session_id: 'session_root',
            name: 'wait_agent_tasks',
            title: 'Wait',
            state: 'succeeded',
            input: { task_ids: ['task_a', 'task_b'] },
          },
          {
            id: 'collect_b_call',
            session_id: 'session_root',
            name: 'get_agent_task_output',
            title: 'Collect Reviewer B',
            state: 'succeeded',
          },
          {
            id: 'collect_a_call',
            session_id: 'session_root',
            name: 'get_agent_task_output',
            title: 'Collect Researcher A',
            state: 'succeeded',
          },
        ]}
      />,
    );

    await user.click(screen.getByRole('tab', { name: 'Timeline' }));
    const labels = [
      ...view.container.querySelectorAll('[aria-label^="Open transcript event"]'),
    ].map((element) => element.getAttribute('aria-label'));
    expect(labels).toEqual([
      'Open transcript event Researcher A',
      'Open transcript event Reviewer B',
      'Open transcript event Reviewer B',
      'Open transcript event Researcher A',
      'Open transcript event Wait',
      'Open transcript event Collect Reviewer B',
      'Open transcript event Collect Researcher A',
    ]);
    expect(screen.queryByText('Spawn Agents')).not.toBeInTheDocument();
    expect(screen.getAllByText('In this turn')).toHaveLength(3);
  });
});
