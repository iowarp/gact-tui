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
  it('updates real session routing and confirms review bypass', async () => {
    const user = userEvent.setup();
    const onChange = vi.fn().mockResolvedValue(undefined);
    render(<ClioSessionBehaviorMenu onChange={onChange} session={session} />);

    await user.click(screen.getByRole('button', { name: /Session behavior:/ }));
    await user.click(screen.getByRole('menuitemradio', { name: 'Use domain experts' }));
    await waitFor(() => expect(onChange).toHaveBeenCalledWith({ routing_mode: 'experts' }));

    await user.click(screen.getByRole('button', { name: /Session behavior:/ }));
    await user.click(screen.getByRole('menuitemradio', { name: 'Bypass checks' }));
    expect(screen.getByRole('alertdialog')).toHaveTextContent(
      'The agent may perform supported actions without asking first.',
    );
    expect(onChange).not.toHaveBeenCalledWith({ approval_mode: 'bypass' });

    await user.click(screen.getByRole('button', { name: 'Bypass checks' }));
    await waitFor(() => expect(onChange).toHaveBeenCalledWith({ approval_mode: 'bypass' }));
  });
});
