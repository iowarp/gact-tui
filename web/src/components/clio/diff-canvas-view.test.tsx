import { cleanup, render, screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, describe, expect, it, vi } from 'vitest';
import type { SessionDiff } from '@clio/core/v3';
import { DiffCanvasView } from './diff-canvas-view';

afterEach(cleanup);

const diff: SessionDiff = {
  id: 'chg_1',
  path: 'src/analysis.py',
  status: 'applied',
  created: false,
  undo_available: true,
  unified_diff: '@@ -1 +1 @@\n-old\n+new',
};

describe('DiffCanvasView', () => {
  it('records an applied change and requires confirmation before undoing it', async () => {
    const user = userEvent.setup();
    const undo = vi.fn().mockResolvedValue(undefined);
    render(<DiffCanvasView diff={diff} onOpenFile={vi.fn()} onUndo={undo} />);

    expect(screen.getByText('File changed by the agent')).toBeVisible();
    expect(screen.queryByRole('button', { name: /apply/i })).toBeNull();
    await user.click(screen.getByRole('button', { name: 'Undo' }));
    const dialog = screen.getByRole('alertdialog');
    expect(within(dialog).getByText(/back as it was before this change/i)).toBeVisible();
    expect(undo).not.toHaveBeenCalled();

    await user.click(within(dialog).getByRole('button', { name: 'Undo' }));
    expect(undo).toHaveBeenCalledWith('chg_1');
  });

  it('says why a change cannot be undone instead of offering Undo', () => {
    render(
      <DiffCanvasView
        diff={{ ...diff, undo_available: false, undo_unavailable_reason: 'previous_content_too_large' }}
        onOpenFile={vi.fn()}
        onUndo={vi.fn()}
      />,
    );

    expect(screen.queryByRole('button', { name: 'Undo' })).toBeNull();
    expect(screen.getByText(/over 256 KiB/i)).toBeVisible();
  });

  it('shows an undone change as settled', () => {
    render(
      <DiffCanvasView
        diff={{ ...diff, status: 'reverted', undo_available: false }}
        onOpenFile={vi.fn()}
        onUndo={vi.fn()}
      />,
    );

    expect(screen.getByText('This change was undone.')).toBeVisible();
    expect(screen.queryByRole('button', { name: 'Undo' })).toBeNull();
  });

  it('keeps an authoritative undo refusal visible', () => {
    render(
      <DiffCanvasView
        diff={diff}
        error="file_changed_since_write: src/analysis.py changed after the agent wrote it"
        onOpenFile={vi.fn()}
        onUndo={vi.fn()}
      />,
    );

    expect(screen.getByText('The change was not undone')).toBeVisible();
    expect(screen.getByText(/changed after the agent wrote it/i)).toBeVisible();
  });
});
