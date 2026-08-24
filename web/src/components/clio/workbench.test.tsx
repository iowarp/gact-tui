import { act, cleanup, fireEvent, render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { createRef } from 'react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { ClioWorkbench, type ClioWorkbenchHandle } from './workbench';

afterEach(cleanup);

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
  it('starts with session intelligence and launches resource tabs', async () => {
    const user = userEvent.setup();
    renderWorkbench();

    expect(screen.getByRole('complementary', { name: 'Workspace canvas' })).toBeVisible();
    expect(screen.getByRole('tab', { name: 'Observability' })).toHaveAttribute(
      'aria-selected',
      'true',
    );
    expect(screen.getByText('Session intelligence')).toBeVisible();

    await user.click(screen.getByRole('button', { name: 'Open a canvas tab' }));
    await user.click(screen.getByRole('menuitem', { name: 'Session artifacts' }));

    expect(screen.getByRole('tab', { name: 'Workspace' })).toHaveAttribute('aria-selected', 'true');
    expect(screen.getByText('No artifacts produced in this session')).toBeVisible();
  });

  it('maximizes over the shell and restores with Escape', async () => {
    const user = userEvent.setup();
    renderWorkbench();

    await user.click(screen.getByRole('button', { name: 'Maximize canvas' }));
    expect(
      screen.getByRole('button', { name: 'Restore canvas beside conversation' }),
    ).toBeVisible();
    expect(screen.getByRole('complementary', { name: 'Workspace canvas' })).toHaveClass('fixed');

    fireEvent.keyDown(window, { key: 'Escape' });
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
