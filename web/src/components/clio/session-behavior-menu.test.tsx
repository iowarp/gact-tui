import type { Session } from '@clio/core/v3';
import { cleanup, render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { ClioSessionBehaviorMenu } from './session-behavior-menu';

vi.mock('sonner', () => ({
  toast: { success: vi.fn(), error: vi.fn() },
}));

afterEach(cleanup);

const session: Session = {
  id: 'sess_ndp',
  workspace_id: 'ws_ndp',
  title: 'Review station evidence',
  state: 'running',
  created_at: '2026-08-23T00:00:00Z',
  updated_at: '2026-08-23T00:01:00Z',
  mode: 'edit',
  edit_mode: 'diff',
  routing_mode: 'auto',
  approval_mode: 'ask',
  pinned: false,
  archived: false,
};

describe('ClioSessionBehaviorMenu', () => {
  it('offers user-level work and confirmation menus without implementation controls', async () => {
    const user = userEvent.setup();
    const onChange = vi.fn().mockResolvedValue(undefined);
    render(<ClioSessionBehaviorMenu onChange={onChange} session={session} />);

    expect(screen.getByRole('button', { name: 'Work mode: Execute' })).toBeVisible();
    expect(screen.getByRole('button', { name: 'Confirmation policy: Ask first' })).toBeVisible();

    await user.click(screen.getByRole('button', { name: 'Work mode: Execute' }));
    expect(screen.queryByText('Specialist use')).not.toBeInTheDocument();
    expect(screen.queryByText('File changes')).not.toBeInTheDocument();
    await user.click(screen.getByRole('menuitemradio', { name: /Deep research/ }));
    await waitFor(() =>
      expect(onChange).toHaveBeenCalledWith({ mode: 'architect', routing_mode: 'experts' }),
    );

    await user.click(screen.getByRole('button', { name: 'Confirmation policy: Ask first' }));
    await user.click(screen.getByRole('menuitemradio', { name: /Bypass checks/ }));
    expect(screen.getByRole('alertdialog')).toHaveTextContent(
      'The agent may perform supported actions without asking first.',
    );
    expect(onChange).not.toHaveBeenCalledWith({ approval_mode: 'bypass' });

    await user.click(screen.getByRole('button', { name: 'Bypass checks' }));
    await waitFor(() => expect(onChange).toHaveBeenCalledWith({ approval_mode: 'bypass' }));
  });
});
