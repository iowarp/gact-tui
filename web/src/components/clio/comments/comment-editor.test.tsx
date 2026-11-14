import { cleanup, render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { CommentEditor } from './comment-editor';

afterEach(cleanup);

describe('CommentEditor (FP-D6)', () => {
  it('opens on the comment, with the drawn region’s numbers behind Adjust region', async () => {
    const user = userEvent.setup();
    const onChange = vi.fn();
    render(
      <CommentEditor
        comment=""
        coordinates={{ box: { x: 0.5, y: 0.3, width: 0.3, height: 0.4 }, onChange }}
        label="S1"
        onCancel={() => undefined}
        onDelete={() => undefined}
        onDone={() => undefined}
        title="Viewer: run.vti"
      />,
    );
    expect(screen.getByText('S1')).toBeVisible();
    expect(screen.getByText('Viewer: run.vti')).toBeVisible();
    expect(screen.getByRole('textbox', { name: 'Comment for S1' })).toHaveFocus();
    const adjust = screen.getByText('Adjust region').closest('details')!;
    expect(adjust).not.toHaveAttribute('open');
    await user.click(screen.getByText('Adjust region'));
    expect(adjust).toHaveAttribute('open');
    expect(screen.getByRole('button', { name: /Done/ })).toBeVisible();
  });
});
