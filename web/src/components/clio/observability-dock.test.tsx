import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { cleanup, render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

const repository = vi.hoisted(() => ({
  readArtifactBytesFor: vi.fn().mockResolvedValue(new Uint8Array([137, 80, 78, 71])),
}));

vi.mock('@/hooks/use-repository', () => ({ useRepository: () => repository }));
import { ClioObservabilityDock, ClioObservabilityView } from './observability-dock';
import { groupToolsForWork } from './observability-grouping';

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

describe('ClioObservabilityView', () => {
  it('opens the unified workspace canvas instead of a duplicate popover', async () => {
    const user = userEvent.setup();
    const onOpenCanvas = vi.fn();
    render(
      <ClioObservabilityDock
        artifacts={[]}
        contextFiles={[]}
        contextFrames={[]}
        diffs={[]}
        messages={[]}
        onOpenCanvas={onOpenCanvas}
        processes={[]}
        runs={[]}
        subagents={[]}
        tasks={[]}
        tools={[]}
      />,
    );

    await user.click(
      screen.getByRole('button', { name: 'Open observability in workspace canvas' }),
    );

    expect(onOpenCanvas).toHaveBeenCalledOnce();
    expect(screen.queryByRole('dialog')).not.toBeInTheDocument();
  });

  it('groups repeated terminal operations in Work without erasing their records', () => {
    const repeated = Array.from({ length: 3 }, (_, index) => ({
      id: `wait_${index}`,
      session_id: 'sess_1',
      name: 'wait_agent_tasks',
      title: 'Wait for child agents',
      state: 'succeeded' as const,
      output: { summary: 'All child agents completed.' },
    }));

    expect(groupToolsForWork(repeated)).toEqual([
      expect.objectContaining({ count: 3, tool: repeated[0] }),
    ]);
    renderObservability(
      <ClioObservabilityView
        artifacts={[]}
        contextFiles={[]}
        contextFrames={[]}
        diffs={[]}
        messages={[]}
        processes={[]}
        runs={[]}
        subagents={[]}
        tasks={[]}
        tools={repeated}
      />,
    );

    expect(screen.getAllByText('Wait for child agents')).toHaveLength(1);
    expect(screen.getByText('3 calls')).toBeVisible();
  });

  it('presents child routing as a central conversation with an explicit canvas action', async () => {
    const user = userEvent.setup();
    const onOpenSubagent = vi.fn();
    const child = {
      id: 'task_geo',
      session_id: 'sess_1',
      child_session_id: 'sess_child',
      title: 'geospatial #1',
      state: 'completed' as const,
      summary: 'main <- geospatial',
    };
    renderObservability(
      <ClioObservabilityView
        artifacts={[]}
        contextFiles={[]}
        contextFrames={[]}
        diffs={[]}
        messages={[]}
        onOpenSubagent={onOpenSubagent}
        processes={[]}
        runs={[]}
        subagents={[child]}
        tasks={[]}
        tools={[]}
      />,
    );

    await user.click(screen.getByRole('button', { name: 'Child agents, 1 recorded, All settled' }));
    expect(screen.getByText('Delegated from main session')).toHaveAttribute(
      'title',
      'Recorded relationship: main <- geospatial',
    );
    expect(screen.queryByText('main <- geospatial')).not.toBeInTheDocument();

    await user.click(
      screen.getByRole('button', {
        name: 'geospatial #1 Completed Delegated from main session Open conversation',
      }),
    );
    expect(onOpenSubagent).toHaveBeenLastCalledWith(child, 'conversation');

    await user.click(screen.getByRole('button', { name: 'Open geospatial #1 in canvas' }));
    expect(onOpenSubagent).toHaveBeenLastCalledWith(child, 'canvas');
  });

  it('keeps child conversations directly accessible beside the observability control', async () => {
    const user = userEvent.setup();
    const onOpenSubagent = vi.fn();
    const child = {
      id: 'task_geo',
      session_id: 'sess_1',
      child_session_id: 'sess_child',
      title: 'geospatial #1',
      state: 'completed' as const,
      task: 'Resolve the region and identify the nearest stations.',
    };
    renderObservability(
      <ClioObservabilityDock
        artifacts={[]}
        contextFiles={[]}
        contextFrames={[]}
        diffs={[]}
        messages={[]}
        onOpenCanvas={() => undefined}
        onOpenSubagent={onOpenSubagent}
        processes={[
          {
            kind: 'agent',
            id: 'task_geo',
            title: 'geospatial #1',
            live_state: 'completed',
            status: 'completed',
            metadata: {},
          },
          {
            kind: 'mcp-task',
            id: 'relay_export',
            title: 'Export station data',
            live_state: 'completed',
            status: 'completed',
            metadata: {},
          },
        ]}
        runs={[]}
        subagents={[child]}
        tasks={[]}
        tools={[]}
      />,
    );

    expect(screen.getByText('2 background activities')).toBeVisible();
    expect(screen.getByText('Settled')).toBeVisible();
    await user.click(screen.getByRole('button', { name: 'Browse child conversations' }));
    await user.click(
      screen.getByRole('button', {
        name: /geospatial #1 Completed Resolve the region and identify the nearest stations/u,
      }),
    );
    expect(onOpenSubagent).toHaveBeenLastCalledWith(child, 'conversation');

    await user.click(screen.getByRole('button', { name: 'Browse child conversations' }));
    await user.click(screen.getByRole('button', { name: 'Open geospatial #1 in canvas' }));
    expect(onOpenSubagent).toHaveBeenLastCalledWith(child, 'canvas');
  });

  it('shows real process spans and groups session evidence without raw payloads', async () => {
    const user = userEvent.setup();
    const openDiff = vi.fn();
    renderObservability(
      <ClioObservabilityView
        artifacts={[
          {
            id: 'artifact_1',
            session_id: 'sess_1',
            name: 'station-plot.png',
            media_type: 'image/png',
            uri: 'artifact://station-plot.png',
          },
        ]}
        contextFiles={[
          {
            path: 'notes.md',
            display_path: 'notes.md',
            mode: 'pin',
            size: 42,
          },
        ]}
        contextFrames={[
          {
            id: 'frame_1',
            session_id: 'sess_1',
            created_at: '2026-08-22T00:00:00Z',
            updated_at: '2026-08-22T00:01:00Z',
            status: 'completed',
            model: {},
            agent: {},
            prompt: {},
            items: [],
            tokens_estimated: 256,
            metadata: {},
          },
        ]}
        diffs={[
          {
            path: 'src/analysis.py',
            status: 'pending',
            applied: false,
            unified_diff: '@@ -1 +1 @@\n-old\n+new',
          },
        ]}
        messages={[
          {
            id: 'message_1',
            session_id: 'sess_1',
            role: 'assistant',
            created_at: '2026-08-22T00:00:00Z',
            blocks: [
              { id: 'plan_1', type: 'plan', title: 'Validate the station catalog' },
              {
                id: 'citation_1',
                type: 'citation',
                label: 'EarthScope catalog',
                uri: 'https://example.test/earthscope',
              },
            ],
          },
        ]}
        onOpenDiff={openDiff}
        onOpenSubagent={() => undefined}
        processes={[
          {
            kind: 'agent',
            id: 'task_1',
            title: 'ndp #1',
            live_state: 'completed',
            status: 'completed',
            created_at: '2026-08-22T00:00:00Z',
            updated_at: '2026-08-22T00:01:00Z',
            result: {
              workflow_state: {
                acquisition: {
                  metadata_source_url: 'https://example.test/data.csv',
                  provenance: 'osm_nominatim',
                },
              },
            },
            metadata: {},
          },
        ]}
        runs={[]}
        subagents={[]}
        tasks={[]}
        tools={[]}
      />,
    );

    expect(screen.getByRole('region', { name: 'Observed execution spans' })).toBeVisible();
    expect(screen.getByText(/delegation map is available in a wider canvas/i)).toBeVisible();
    expect(screen.getByText('ndp #1')).toBeVisible();
    expect(screen.getByText(/bars show concurrency/i)).toBeVisible();

    await user.click(screen.getByRole('tab', { name: 'Evidence' }));

    expect(screen.getByText('Session evidence')).toBeVisible();
    expect(screen.getByText('Context files')).toBeVisible();
    expect(screen.getByText('src/analysis.py')).toBeVisible();
    expect(screen.getByRole('link', { name: /EarthScope catalog/i })).toHaveAttribute(
      'href',
      'https://example.test/earthscope',
    );
    expect(screen.getByRole('link', { name: /data\.csv/i })).toHaveAttribute(
      'href',
      'https://example.test/data.csv',
    );
    expect(screen.getByText('ndp #1, Metadata source URL')).toBeVisible();
    expect(screen.getByText('OpenStreetMap Nominatim')).toHaveAttribute('title', 'osm_nominatim');
    expect(screen.queryByText(/workflow_state/u)).not.toBeInTheDocument();

    await user.click(
      screen.getByRole('button', { name: 'Review diff for src/analysis.py in canvas' }),
    );
    expect(openDiff).toHaveBeenCalledWith(
      expect.objectContaining({ path: 'src/analysis.py', status: 'pending' }),
    );
  });

  it('labels containing-turn time without presenting it as exact tool execution time', async () => {
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
    expect(screen.getByText(/exact tool execution times were not recorded/i)).toBeVisible();
    expect(screen.getByText(/Turn started/u)).toBeVisible();
    expect(screen.queryByText('Time unavailable')).not.toBeInTheDocument();
  });
});

function renderObservability(children: React.ReactNode) {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  return render(<QueryClientProvider client={client}>{children}</QueryClientProvider>);
}
