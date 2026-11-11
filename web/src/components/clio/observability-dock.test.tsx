import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { cleanup, render, screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { PRESENTATION_OVERRIDE_REGISTRY } from '@/lib/presentation-override-registry';
import { reportPresentationOverride } from '@/lib/presentation-overrides';

const repository = vi.hoisted(() => ({
  readArtifactBytesFor: vi.fn().mockResolvedValue(new Uint8Array([137, 80, 78, 71])),
}));

vi.mock('@/hooks/use-repository', () => ({ useRepository: () => repository }));
vi.mock('@/providers/connection-provider', () => ({
  useConnectionSettings: () => ({ settings: { endpoint: 'http://127.0.0.1' } }),
}));
import { ClioObservabilityDock, ClioObservabilityView } from './observability-dock';
import { ObservabilityViewControl } from './observability-view-control';
import type { ObservabilityView } from './observability-view-storage';

beforeEach(() => {
  localStorage.clear();
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

it('keeps lost task visibility out of settled dock status and follows later completion', () => {
  const props = {
    artifacts: [],
    contextFiles: [],
    contextFrames: [],
    diffs: [],
    messages: [],
    processes: [
      {
        id: 'unresolved-task',
        kind: 'mcp' as const,
        title: 'Prepare dataset',
        status: 'working',
        live_state: 'task_state_uncertain' as const,
        effective_status: 'task_state_uncertain' as const,
        metadata: {},
      },
    ],
    runs: [],
    subagents: [],
    tasks: [],
    tools: [],
  };
  const view = render(<ClioObservabilityDock {...props} />);
  expect(document.querySelector('[aria-live="polite"]')).toHaveTextContent('Needs inspection');
  expect(document.querySelector('[data-slot="badge"]')).toHaveClass('border-warning/30');
  expect(screen.queryByText('Settled')).not.toBeInTheDocument();
  view.rerender(
    <ClioObservabilityDock
      {...props}
      processes={props.processes.map((process) => ({
        ...process,
        live_state: 'completed',
        effective_status: 'completed',
        status: 'completed',
      }))}
    />,
  );
  expect(document.querySelector('[aria-live="polite"]')).toHaveTextContent('Settled');
  expect(screen.queryByText('Needs inspection')).not.toBeInTheDocument();
});

describe('ClioObservabilityView', () => {
  it('honors a new requested tab even when the same session view is already mounted', async () => {
    const props = {
      artifacts: [],
      contextFiles: [],
      contextFrames: [],
      diffs: [],
      messages: [],
      processes: [],
      tasks: [],
      tools: [],
      runs: [],
      subagents: [],
      sessionId: 'requested-context',
    };
    const view = (key: string, tab: 'context' | 'activity') => (
      <ClioObservabilityView {...props} requestedView={{ key, view: tab }} />
    );
    const rendered = render(view('first', 'context'));
    expect(screen.getByRole('tab', { name: 'Context' })).toHaveAttribute('data-state', 'active');
    await userEvent.setup().click(screen.getByRole('tab', { name: 'Timeline' }));
    rendered.rerender(view('second', 'context'));
    expect(screen.getByRole('tab', { name: 'Context' })).toHaveAttribute('data-state', 'active');
    rendered.rerender(view('third', 'activity'));
    expect(screen.getByRole('tab', { name: 'Timeline' })).toHaveAttribute('data-state', 'active');
  });
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
            blocks: [{ id: 'block_1', type: 'text', text: 'Working on it', streaming: true }],
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
    // region (which always mirrors it so status transitions are announced) â€” assert the badge.
    const workingBadge = screen
      .getAllByText('Working')
      .find((element) => element.closest('[data-slot="badge"]'));
    expect(workingBadge).toBeDefined();
    warn.mockRestore();
  });

  it('pins the conversation rail open and hands full details to the workspace canvas', async () => {
    const user = userEvent.setup();
    const onOpenCanvas = vi.fn();
    const queryClient = new QueryClient({ defaultOptions: { queries: { retry: false } } });
    render(
      <QueryClientProvider client={queryClient}>
        <p>Transcript</p>
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
        />
      </QueryClientProvider>,
    );

    const button = screen.getByRole('button', { name: 'Conversation rail' });
    expect(button).toHaveAttribute('aria-expanded', 'false');
    await user.click(button);
    const rail = screen.getByRole('region', { name: 'This conversation' });
    expect(button).toHaveAttribute('aria-expanded', 'true');
    expect(within(rail).getByRole('region', { name: 'Context section' })).toBeVisible();
    // Pinned: working in the transcript leaves it open.
    await user.click(screen.getByText('Transcript'));
    expect(screen.getByRole('region', { name: 'This conversation' })).toBeVisible();
    await user.click(within(rail).getByRole('button', { name: 'Open full view' }));
    expect(onOpenCanvas).toHaveBeenCalledOnce();
    // The full view replaces the rail.
    expect(screen.queryByRole('region', { name: 'This conversation' })).not.toBeInTheDocument();
    expect(button).toHaveAttribute('aria-expanded', 'false');
    await user.click(button);
    expect(screen.getByRole('region', { name: 'This conversation' })).toBeVisible();
    await user.click(button);
    expect(screen.queryByRole('region', { name: 'This conversation' })).not.toBeInTheDocument();
  });

  it('opens at the first run with its key and closes with it again', async () => {
    const user = userEvent.setup();
    const queryClient = new QueryClient({ defaultOptions: { queries: { retry: false } } });
    render(
      <QueryClientProvider client={queryClient}>
        <ClioObservabilityDock
          artifacts={[]}
          contextFiles={[]}
          contextFrames={[]}
          diffs={[]}
          messages={[]}
          processes={[
            {
              id: 'relay_export',
              kind: 'mcp-task',
              title: 'Export station data',
              live_state: 'running',
              status: 'running',
              metadata: {},
            },
          ]}
          runs={[]}
          subagents={[]}
          tasks={[]}
          tools={[
            {
              id: 'read',
              session_id: 'session',
              name: 'read',
              state: 'succeeded',
              presentation: { action: 'Read source', summary: '', blocks: [] },
            },
          ]}
        />
      </QueryClientProvider>,
    );
    await user.keyboard('{Control>}.{/Control}');
    const rail = await screen.findByRole('region', { name: 'This conversation' });
    expect(within(rail).getByRole('region', { name: 'Tool calls section' })).toBeVisible();
    await vi.waitFor(() =>
      expect(within(rail).getByRole('button', { name: 'Export station data' })).toHaveFocus(),
    );
    await user.keyboard('{ArrowUp}');
    expect(within(rail).getByRole('button', { name: 'Collapse Running' })).toHaveFocus();
    await user.keyboard('{Control>}.{/Control}');
    expect(screen.queryByRole('region', { name: 'This conversation' })).not.toBeInTheDocument();
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
    expect(badge).toHaveTextContent('Permission needed');
    expect(badge).not.toHaveTextContent('Up to date');
    expect(badge).toHaveClass('border-action/30');
    expect(badge).not.toHaveClass('border-info/30');
    expect(badge?.querySelector('svg[class*="animate-spin"]')).toBeNull();
  });

  it('labels a failed session truthfully, never a red "Up to date" (rel18)', () => {
    render(
      <ClioObservabilityDock
        artifacts={[]}
        contextFiles={[]}
        contextFrames={[]}
        diffs={[]}
        messages={[]}
        processes={[]}
        runs={[]}
        sessionId="sess_failed"
        sessionState="failed"
        subagents={[]}
        tasks={[]}
        tools={[]}
      />,
    );

    const badge = document.querySelector('[data-slot="badge"]');
    expect(badge).not.toBeNull();
    expect(badge).toHaveTextContent('Failed');
    expect(badge).toHaveClass('border-destructive/30');
    expect(screen.queryByText('Up to date')).not.toBeInTheDocument();
    expect(document.querySelector('[aria-live="polite"]')).toHaveTextContent('Failed');
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
    expect(liveRegion).toHaveTextContent('No active work');
    expect(liveRegion).not.toHaveTextContent('Up to date');
    const button = screen.getByRole('button', { name: 'Conversation rail' });
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
            blocks: [{ id: 'block_1', type: 'text', text: 'Working on it', streaming: true }],
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
    const evidenceControl = screen.getByRole('button', { name: 'Conversation rail' });
    expect(within(evidenceControl).getByText('Settled')).toBeVisible();
    await user.click(screen.getByRole('button', { name: 'Browse child conversations' }));
    await user.click(
      screen.getByRole('button', {
        name: /geospatial #1 Completed Resolve the region and identify the nearest stations/u,
      }),
    );
    expect(onOpenSubagent).toHaveBeenLastCalledWith(child, 'canvas');

    await user.click(screen.getByRole('button', { name: 'Browse child conversations' }));
    await user.click(screen.getByRole('button', { name: 'Open geospatial #1 in canvas' }));
    expect(onOpenSubagent).toHaveBeenLastCalledWith(child, 'canvas');
  });

  it('shows the host-controlled view without its own view switch', () => {
    const props = {
      artifacts: [],
      contextFiles: [],
      contextFrames: [],
      diffs: [],
      messages: [],
      processes: [],
      tasks: [],
      tools: [],
      runs: [],
      subagents: [],
      sessionId: 'host-controlled',
    };
    const view = (control: ObservabilityView) => (
      <ObservabilityViewControl.Provider value={{ view: control }}>
        <ClioObservabilityView {...props} requestedView={{ key: 'ignored', view: 'activity' }} />
      </ObservabilityViewControl.Provider>
    );
    const rendered = renderObservability(view('context'));
    expect(screen.queryByRole('tablist')).not.toBeInTheDocument();
    expect(screen.getByRole('tabpanel')).toHaveAttribute('id', expect.stringMatching(/context$/u));
    rendered.rerender(
      <QueryClientProvider client={new QueryClient()}>{view('activity')}</QueryClientProvider>,
    );
    expect(screen.queryByRole('tablist')).not.toBeInTheDocument();
    expect(screen.getByRole('tabpanel')).toHaveAttribute('id', expect.stringMatching(/activity$/u));
  });
});

function renderObservability(children: React.ReactNode) {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  return render(<QueryClientProvider client={client}>{children}</QueryClientProvider>);
}
