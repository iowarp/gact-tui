import { act, cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import userEvent from '@testing-library/user-event';
import { createRef } from 'react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { ClioWorkbench, type ClioWorkbenchHandle } from './workbench';
import { WorkspaceCanvasVisibilityProvider } from './workspace-canvas-visibility';

const { repository } = vi.hoisted(() => ({
  repository: {
    readArtifactTextFor: vi.fn(),
    readWorkspaceFile: vi.fn(),
  },
}));

vi.mock('@/hooks/use-repository', () => ({ useRepository: () => repository }));
vi.mock('@/providers/connection-provider', () => ({
  useConnectionSettings: () => ({ settings: { endpoint: 'http://127.0.0.1:8790' } }),
}));

afterEach(() => {
  cleanup();
  vi.clearAllMocks();
});

function renderWorkbench() {
  return render(
    <ClioWorkbench
      artifacts={[]}
      blueprints={[]}
      diffs={[]}
      files={[]}
      onApplyDiff={vi.fn()}
      onOpenSubagent={vi.fn()}
      onRejectDiff={vi.fn()}
      sessionId="session_parent"
      sessionView={<p>Session intelligence</p>}
      workspaceId="workspace_1"
    />,
  );
}

describe('ClioWorkbench canvas', () => {
  it('keeps tabs mounted while suspending hidden canvas content', () => {
    const { rerender } = render(
      <WorkspaceCanvasVisibilityProvider visible={false}>
        <ClioWorkbench
          artifacts={[]}
          blueprints={[]}
          diffs={[]}
          files={[]}
          onApplyDiff={vi.fn()}
          onOpenSubagent={vi.fn()}
          onRejectDiff={vi.fn()}
          sessionId="session_parent"
          sessionView={<p>Session intelligence</p>}
          workspaceId="workspace_1"
        />
      </WorkspaceCanvasVisibilityProvider>,
    );

    expect(screen.getByRole('tab', { name: 'Observability' })).toHaveAttribute(
      'aria-selected',
      'true',
    );
    expect(screen.queryByText('Session intelligence')).not.toBeInTheDocument();

    rerender(
      <WorkspaceCanvasVisibilityProvider visible>
        <ClioWorkbench
          artifacts={[]}
          blueprints={[]}
          diffs={[]}
          files={[]}
          onApplyDiff={vi.fn()}
          onOpenSubagent={vi.fn()}
          onRejectDiff={vi.fn()}
          sessionId="session_parent"
          sessionView={<p>Session intelligence</p>}
          workspaceId="workspace_1"
        />
      </WorkspaceCanvasVisibilityProvider>,
    );

    expect(screen.getByText('Session intelligence')).toBeVisible();
  });

  it('starts with session intelligence and launches resource tabs', async () => {
    const user = userEvent.setup();
    renderWorkbench();

    expect(screen.getByRole('complementary', { name: 'Workspace canvas' })).toBeVisible();
    expect(screen.getByRole('tab', { name: 'Observability' })).toHaveAttribute(
      'aria-selected',
      'true',
    );
    expect(screen.getByText('Session intelligence')).toBeVisible();
    expect(screen.getByRole('tablist').parentElement).toHaveClass('no-scrollbar');

    await user.click(screen.getByRole('button', { name: 'Open a canvas tab' }));
    await user.click(screen.getByRole('menuitem', { name: 'Session artifacts' }));

    expect(screen.getByRole('tab', { name: 'Artifacts' })).toHaveAttribute('aria-selected', 'true');
    expect(screen.getByText('No session artifacts')).toBeVisible();
  });

  it('places each close action on the tab it closes', async () => {
    const user = userEvent.setup();
    renderWorkbench();

    await user.click(screen.getByRole('button', { name: 'Open a canvas tab' }));
    await user.click(screen.getByRole('menuitem', { name: 'Session artifacts' }));

    const observabilityTab = screen.getByRole('tab', { name: 'Observability' });
    const artifactsTab = screen.getByRole('tab', { name: 'Artifacts' });
    const observabilityClose = observabilityTab.querySelector('[data-slot="canvas-tab-close"]');
    const artifactsClose = artifactsTab.querySelector('[data-slot="canvas-tab-close"]');

    expect(observabilityClose).not.toBeNull();
    expect(artifactsClose).not.toBeNull();
    expect(observabilityClose).toHaveAttribute('title', 'Close Observability');
    expect(artifactsClose).toHaveAttribute('title', 'Close Artifacts');
    // Reachability, not just a synthesized pointerDown: a real accessible name, and never
    // hit-test-blocked off hover (touch has no hover to gate visibility on).
    expect(observabilityClose).toHaveAccessibleName('Close Observability');
    expect(observabilityClose).not.toHaveClass('pointer-events-none');

    act(() => artifactsTab.focus());
    await user.keyboard('{ArrowLeft}');
    expect(observabilityTab).toHaveAttribute('aria-selected', 'true');
    await user.keyboard('{ArrowRight}');
    expect(artifactsTab).toHaveAttribute('aria-selected', 'true');

    await user.click(observabilityClose!);
    expect(screen.queryByRole('tab', { name: 'Observability' })).not.toBeInTheDocument();
    expect(artifactsTab).toHaveAttribute('aria-selected', 'true');
  });

  it('replaces the artifact picker tab with the selected artifact view', async () => {
    const user = userEvent.setup();
    const queryClient = new QueryClient({ defaultOptions: { queries: { retry: false } } });
    repository.readArtifactTextFor.mockImplementation(async (artifact: { name: string }) =>
      artifact.name === 'report.md' ? '# Report' : 'station,value\nMTA1,72',
    );
    render(
      <QueryClientProvider client={queryClient}>
        <ClioWorkbench
          artifacts={[
            {
              id: 'report_1',
              session_id: 'session_parent',
              workspace_id: 'workspace_1',
              name: 'report.md',
              media_type: 'text/markdown',
              size: 8,
              uri: 'artifact://workspace_1/report.md@v1',
              session_relation: 'produced',
            },
            {
              id: 'input_1',
              session_id: 'session_parent',
              workspace_id: 'workspace_1',
              name: 'stations.csv',
              media_type: 'text/csv',
              size: 23,
              uri: 'artifact://workspace_1/stations.csv@v1',
              session_relation: 'used',
            },
          ]}
          blueprints={[]}
          diffs={[]}
          files={[]}
          onApplyDiff={vi.fn()}
          onOpenSubagent={vi.fn()}
          onRejectDiff={vi.fn()}
          sessionId="session_parent"
          sessionView={<p>Session intelligence</p>}
          workspaceId="workspace_1"
        />
      </QueryClientProvider>,
    );

    await user.click(screen.getByRole('button', { name: 'Open a canvas tab' }));
    await user.click(screen.getByRole('menuitem', { name: 'Session artifacts' }));

    expect(screen.getByRole('button', { name: 'Open report.md' })).toBeVisible();
    expect(screen.getByRole('button', { name: 'Open stations.csv' })).toBeVisible();
    expect(screen.getByText('Output')).toBeVisible();
    expect(screen.getByText('Input')).toBeVisible();
    await user.click(screen.getByRole('button', { name: 'Open report.md' }));
    expect(screen.queryByRole('tab', { name: 'Artifacts' })).not.toBeInTheDocument();
    expect(screen.getByRole('tab', { name: 'report.md' })).toHaveAttribute('aria-selected', 'true');
    // The markdown view tokenizes content into per-token spans, so assert on
    // textContent instead of a single text node.
    await waitFor(() => expect(document.body).toHaveTextContent('# Report'));
  });

  it('keeps the picker in a resizable split when an artifact is shift-clicked', async () => {
    const user = userEvent.setup();
    const queryClient = new QueryClient({ defaultOptions: { queries: { retry: false } } });
    repository.readArtifactTextFor.mockResolvedValue('# Report');
    render(
      <QueryClientProvider client={queryClient}>
        <ClioWorkbench
          artifacts={[
            {
              id: 'report_1',
              session_id: 'session_parent',
              workspace_id: 'workspace_1',
              name: 'report.md',
              media_type: 'text/markdown',
              size: 8,
              uri: 'artifact://workspace_1/report.md@v1',
              session_relation: 'produced',
            },
          ]}
          blueprints={[]}
          diffs={[]}
          files={[]}
          onApplyDiff={vi.fn()}
          onOpenSubagent={vi.fn()}
          onRejectDiff={vi.fn()}
          sessionId="session_parent"
          sessionView={<p>Session intelligence</p>}
          workspaceId="workspace_1"
        />
      </QueryClientProvider>,
    );

    await user.click(screen.getByRole('button', { name: 'Open a canvas tab' }));
    await user.click(screen.getByRole('menuitem', { name: 'Session artifacts' }));
    fireEvent.click(screen.getByRole('button', { name: 'Open report.md' }), { shiftKey: true });

    expect(screen.getByRole('tab', { name: 'Artifacts' })).toHaveAttribute('aria-selected', 'true');
    expect(screen.getByRole('region', { name: 'Selected artifact' })).toBeVisible();
    await waitFor(() =>
      expect(screen.getByRole('region', { name: 'Selected artifact' })).toHaveTextContent(
        '# Report',
      ),
    );
  });

  it('closes and reopens observability as a normal canvas tab', async () => {
    const user = userEvent.setup();
    renderWorkbench();

    const observabilityTab = screen.getByRole('tab', { name: 'Observability' });
    act(() => observabilityTab.focus());
    await user.keyboard('{Delete}');
    expect(screen.queryByRole('tab', { name: 'Observability' })).not.toBeInTheDocument();
    expect(screen.getByText('Canvas is empty')).toBeVisible();

    await user.click(screen.getByRole('button', { name: 'Open a canvas tab' }));
    await user.click(screen.getByRole('menuitem', { name: 'Observability' }));

    expect(screen.getByRole('tab', { name: 'Observability' })).toHaveAttribute(
      'aria-selected',
      'true',
    );
    expect(screen.getByText('Session intelligence')).toBeVisible();
  });

  it('maximizes over the shell and restores with Escape', async () => {
    const user = userEvent.setup();
    renderWorkbench();

    await user.click(screen.getByRole('button', { name: 'Maximize canvas' }));
    expect(
      screen.getByRole('button', { name: 'Restore canvas beside conversation' }),
    ).toBeVisible();
    expect(screen.getByRole('complementary', { name: 'Workspace canvas' })).toHaveClass('fixed');

    const restoreEvent = new KeyboardEvent('keydown', {
      key: 'Escape',
      bubbles: true,
      cancelable: true,
    });
    act(() => window.dispatchEvent(restoreEvent));
    expect(restoreEvent.defaultPrevented).toBe(true);
    expect(screen.getByRole('button', { name: 'Maximize canvas' })).toBeVisible();
  });

  it('opens a changed file as a durable review tab', () => {
    const ref = createRef<ClioWorkbenchHandle>();
    const diff = {
      path: 'src/analysis.py',
      status: 'pending',
      applied: false,
      unified_diff: '@@ -1 +1 @@\n-old\n+new',
    };
    render(
      <ClioWorkbench
        artifacts={[]}
        blueprints={[]}
        diffs={[diff]}
        files={[]}
        onApplyDiff={vi.fn()}
        onOpenSubagent={vi.fn()}
        onRejectDiff={vi.fn()}
        ref={ref}
        sessionId="session_parent"
        sessionView={<p>Session intelligence</p>}
        workspaceId="workspace_1"
      />,
    );

    act(() => ref.current?.open({ kind: 'diff', diff }));

    expect(screen.getByRole('tab', { name: 'analysis.py' })).toHaveAttribute(
      'aria-selected',
      'true',
    );
    expect(screen.getByText('Review file change')).toBeVisible();
    expect(screen.getByRole('button', { name: 'Apply change' })).toBeVisible();
    expect(screen.getByRole('button', { name: 'Reject change' })).toBeVisible();
  });

  it('keeps the file tree beside a directly opened rendered file', async () => {
    const user = userEvent.setup();
    const ref = createRef<ClioWorkbenchHandle>();
    const queryClient = new QueryClient({ defaultOptions: { queries: { retry: false } } });
    repository.readWorkspaceFile.mockResolvedValue('# workspace report');
    render(
      <QueryClientProvider client={queryClient}>
        <ClioWorkbench
          artifacts={[]}
          blueprints={[]}
          diffs={[]}
          files={[{ path: 'reports/summary.md', type: 'file', internal: false, size: 18 }]}
          onApplyDiff={vi.fn()}
          onOpenSubagent={vi.fn()}
          onRejectDiff={vi.fn()}
          ref={ref}
          sessionId="session_parent"
          sessionView={<p>Session intelligence</p>}
          workspaceId="workspace_1"
        />
      </QueryClientProvider>,
    );

    act(() => ref.current?.open({ kind: 'workspace-file', path: 'reports/summary.md' }));

    expect(screen.getByRole('tree')).toBeVisible();
    await user.click(screen.getByRole('button', { name: 'Expand folder reports' }));
    const fileRow = screen.getByRole('treeitem', { name: 'summary.md' });
    expect(fileRow).toBeVisible();
    expect(fileRow).toHaveClass('min-w-0', 'w-full');
    expect(await screen.findByText('# workspace report')).toBeVisible();
    expect(document.querySelector('[data-slot="code-block-scroll"]')).toHaveClass(
      'min-h-0',
      'flex-1',
      'overflow-auto',
    );
    expect(repository.readWorkspaceFile).toHaveBeenCalledWith(
      'workspace_1',
      'reports/summary.md',
      expect.any(AbortSignal),
    );
  });

  it('delivers a requested tab when a compact canvas mounts after the request', () => {
    const diff = {
      path: 'src/compact-canvas.py',
      status: 'pending',
      applied: false,
      unified_diff: '@@ -1 +1 @@\n-old\n+new',
    };

    render(
      <ClioWorkbench
        artifacts={[]}
        blueprints={[]}
        diffs={[diff]}
        files={[]}
        onApplyDiff={vi.fn()}
        onOpenSubagent={vi.fn()}
        onRejectDiff={vi.fn()}
        requestedOpen={{ key: 'request-1', request: { kind: 'diff', diff } }}
        sessionId="session_parent"
        sessionView={<p>Session intelligence</p>}
        workspaceId="workspace_1"
      />,
    );

    expect(screen.getByRole('tab', { name: 'compact-canvas.py' })).toHaveAttribute(
      'aria-selected',
      'true',
    );
    expect(screen.getByText('Review file change')).toBeVisible();
  });
});
