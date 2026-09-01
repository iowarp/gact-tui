import { cleanup, render, screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { DiffCanvasView } from './diff-canvas-view';

afterEach(cleanup);

const diff = {
  path: 'src/analysis.py',
  status: 'pending',
  applied: false,
  unified_diff: '@@ -1 +1 @@\n-old\n+new',
} as const;

describe('DiffCanvasView', () => {
  it('requires confirmation before applying the selected server diff', async () => {
    const user = userEvent.setup();
    const apply = vi.fn().mockResolvedValue(undefined);
    render(
      <DiffCanvasView
        diff={diff}
        onApply={apply}
        onOpenFile={vi.fn()}
        onReject={vi.fn()}
      />,
    );

    await user.click(screen.getByRole('button', { name: 'Apply change' }));
    const dialog = screen.getByRole('alertdialog');
    expect(within(dialog).getByText(/workspace permission boundary/i)).toBeVisible();
    expect(apply).not.toHaveBeenCalled();

    await user.click(within(dialog).getByRole('button', { name: 'Apply change' }));
    expect(apply).toHaveBeenCalledWith('src/analysis.py');
  });

  it('keeps an authoritative write failure visible', () => {
    render(
      <DiffCanvasView
        diff={diff}
        error="The service could not apply src/analysis.py: permission denied"
        onApply={vi.fn()}
        onOpenFile={vi.fn()}
        onReject={vi.fn()}
      />,
    );

    expect(screen.getByText('File change was not updated')).toBeVisible();
    expect(screen.getByText(/permission denied/i)).toBeVisible();
  });
});
