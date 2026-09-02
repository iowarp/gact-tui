import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { cleanup, fireEvent, render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { PRESENTATION_OVERRIDE_REGISTRY } from '@/lib/presentation-override-registry';
import { reportPresentationOverride } from '@/lib/presentation-overrides';

const repository = vi.hoisted(() => ({
  readArtifactBytesFor: vi.fn().mockResolvedValue(new Uint8Array([137, 80, 78, 71])),
}));

vi.mock('@/hooks/use-repository', () => ({ useRepository: () => repository }));
import { ClioObservabilityDock, ClioObservabilityView } from './observability-dock';

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
  it('surfaces governed presentation fallbacks beside the live session status', () => {
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => undefined);
    reportPresentationOverride({
      kind: 'child-assignment-fallback',
      entityId: 'task_unassigned',
      sessionId: 'sess_override_dock',
      serverValue: { summary: undefined, task: undefined },
      rendered: 'Delegated work',
      issue: PRESENTATION_OVERRIDE_REGISTRY['child-assignment-fallback'].issue,
    });

    render(
      <ClioObservabilityDock
        artifacts={[]}
        contextFiles={[]}
        contextFrames={[]}
        diffs={[]}
        messages={[
          {
            id: 'msg_1',
            session_id: 'sess_override_dock',
            role: 'assistant',
            created_at: '2026-08-27T12:00:00Z',
            blocks: [{ id: 'block_1', type: 'text', text: 'Working on it' }],
          },
        ]}
        processes={[]}
        runs={[]}
        sessionId="sess_override_dock"
        sessionState="running"
        subagents={[]}
        tasks={[]}
        tools={[]}
      />,
    );

    expect(screen.getByText('1 display fallback')).toBeInTheDocument();
    // "Working" renders both in the visible status badge and in the persistent sr-only live
    // region (which always mirrors it so status transitions are announced) — assert the badge.
    const workingBadge = screen
      .getAllByText('Working')
      .find((element) => element.closest('[data-slot="badge"]'));
    expect(workingBadge).toBeDefined();
    warn.mockRestore();
  });

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

  it('shows a session waiting on permission with its own typed status, not the running spinner', () => {
    render(
      <ClioObservabilityDock
        artifacts={[]}
        contextFiles={[]}
        contextFrames={[]}
        diffs={[]}
        messages={[]}
        processes={[]}
        runs={[]}
        sessionId="sess_waiting"
        sessionState="waiting_permission"
        subagents={[]}
        tasks={[]}
        tools={[]}
      />,
    );

    const badge = document.querySelector('[data-slot="badge"]');
    expect(badge).not.toBeNull();
    expect(badge).toHaveTextContent('Up to date');
    expect(badge).toHaveClass('border-action/30');
    expect(badge).not.toHaveClass('border-info/30');
    expect(badge?.querySelector('svg')).not.toHaveClass('motion-safe:animate-spin');
  });

  it('keeps the live status region mounted, and outside the button, across a status change', () => {
    const { rerender } = render(
      <ClioObservabilityDock
        artifacts={[]}
        contextFiles={[]}
        contextFrames={[]}
        diffs={[]}
        messages={[]}
        processes={[]}
        runs={[]}
        subagents={[]}
        tasks={[]}
        tools={[]}
      />,
    );

    const liveRegion = document.querySelector('[aria-live="polite"]');
    expect(liveRegion).not.toBeNull();
    expect(liveRegion).toHaveTextContent('Up to date');
    const button = screen.getByRole('button', { name: 'Open observability in workspace canvas' });
    expect(button.contains(liveRegion)).toBe(false);

    rerender(
      <ClioObservabilityDock
        artifacts={[]}
        contextFiles={[]}
        contextFrames={[]}
        diffs={[]}
        messages={[
          {
            id: 'msg_1',
            session_id: 'sess_1',
            role: 'assistant',
            created_at: '2026-08-27T12:00:00Z',
            blocks: [{ id: 'block_1', type: 'text', text: 'Working on it' }],
          },
        ]}
        processes={[]}
        runs={[]}
        sessionState="running"
        subagents={[]}
        tasks={[]}
        tools={[]}
      />,
    );

    const liveRegionAfter = document.querySelector('[aria-live="polite"]');
    expect(liveRegionAfter).not.toBeNull();
    expect(liveRegionAfter).toBe(liveRegion);
    expect(liveRegionAfter).toHaveTextContent('Working');
  });

  it('opens a child lane centrally and uses shift-click for a durable canvas tab', async () => {
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
        processes={[
          {
            kind: 'agent',
            id: 'task_geo',
            title: 'geospatial #1',
            live_state: 'completed',
            status: 'completed',
            created_at: '2026-08-22T00:00:00Z',
            updated_at: '2026-08-22T00:01:00Z',
            metadata: {},
          },
        ]}
        runs={[]}
        sessionId="sess_dock"
        subagents={[child]}
        tasks={[]}
        tools={[]}
      />,
    );

    const childLane = screen.getByRole('button', { name: /geospatial #1, completed/iu });
    await user.click(childLane);
    expect(onOpenSubagent).toHaveBeenLastCalledWith(child, 'conversation');

    fireEvent.click(childLane, { shiftKey: true });
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
        sessionId="sess_child_conversations"
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
    const openResource = vi.fn();
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
            id: 'message_resource',
            session_id: 'sess_1',
            role: 'user',
            created_at: '2026-08-21T23:59:59Z',
            blocks: [
              {
                id: 'resource_1',
                type: 'resource',
                resource_id: 'resource_pdf',
                resource_revision: '1',
                workspace_id: 'ws_1',
                name: 'paper.pdf',
                media_type: 'application/pdf',
              },
            ],
          },
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
        onOpenResource={openResource}
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
        resources={[
          {
            id: 'resource_pdf',
            workspace_id: 'ws_1',
            client_upload_id: 'upload_1',
            revision: 1,
            name: 'paper.pdf',
            claimed_mime: 'application/pdf',
            detected_mime: 'application/pdf',
            detection_source: 'signature',
            declared_size: 4096,
            received_size: 4096,
            sha256: '0123456789abcdef0123456789abcdef0123456789abcdef0123456789abcdef',
            state: 'ready',
            failure: '',
            created_at: '2026-08-21T23:59:58Z',
            updated_at: '2026-08-21T23:59:59Z',
            completed_at: '2026-08-21T23:59:59Z',
            mime_mismatch: false,
          },
        ]}
        subagents={[]}
        tasks={[]}
        tools={[]}
      />,
    );

    expect(screen.getByRole('region', { name: 'Observed execution spans' })).toBeVisible();
    expect(screen.getByText(/delegation map is available in a wider canvas/i)).toBeVisible();
    expect(screen.getByText('ndp #1')).toBeVisible();
    expect(screen.getByText('Execution')).toBeVisible();

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
    expect(screen.getByText('paper.pdf')).toBeVisible();
    expect(screen.getByText(/SHA-256 0123456789ab/u)).toBeVisible();
    expect(screen.queryByText(/workflow_state/u)).not.toBeInTheDocument();

    await user.click(screen.getByRole('button', { name: 'Open source paper.pdf' }));
    expect(openResource).toHaveBeenCalledWith(expect.objectContaining({ id: 'resource_pdf' }));

    await user.click(
      screen.getByRole('button', { name: 'Review diff for src/analysis.py in canvas' }),
    );
    expect(openDiff).toHaveBeenCalledWith(
      expect.objectContaining({ path: 'src/analysis.py', status: 'pending' }),
    );
  });

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
    expect(screen.getByText('Observed in its containing turn')).toBeVisible();
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
    expect(screen.getByText('Evidence custody')).toBeVisible();
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
        runs={[]}
        subagents={[]}
        tasks={[]}
        tools={[]}
      />,
    );

    expect(screen.getByText(/Partial flowcept provenance/u)).toBeVisible();
  });
});

function renderObservability(children: React.ReactNode) {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  return render(<QueryClientProvider client={client}>{children}</QueryClientProvider>);
}
