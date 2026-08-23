import { cleanup, render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { ClioSessionActions } from './session-actions';

afterEach(cleanup);

function renderActions() {
  const actions = {
    onFork: vi.fn().mockResolvedValue(undefined),
    onCompact: vi.fn().mockResolvedValue(undefined),
    onShare: vi.fn().mockResolvedValue('http://127.0.0.1:8787/v1/shared/shr_test'),
    onUndo: vi.fn().mockResolvedValue(undefined),
  };
  render(<ClioSessionActions {...actions} title="EarthScope NDP" />);
  return actions;
}

describe('ClioSessionActions', () => {
  it('branches without destructive confirmation', async () => {
    const user = userEvent.setup();
    const actions = renderActions();

    await user.click(screen.getByRole('button', { name: 'Actions for EarthScope NDP' }));
    await user.click(screen.getByRole('menuitem', { name: 'Branch into a new session' }));

    expect(actions.onFork).toHaveBeenCalledOnce();
    expect(screen.queryByRole('alertdialog')).not.toBeInTheDocument();
  });

  it('confirms transcript compaction with explicit consequences', async () => {
    const user = userEvent.setup();
    const actions = renderActions();

    await user.click(screen.getByRole('button', { name: 'Actions for EarthScope NDP' }));
    await user.click(screen.getByRole('menuitem', { name: 'Compact conversation' }));

    expect(screen.getByRole('alertdialog')).toHaveTextContent(
      'evidence-preserving compact summary',
    );
    await user.click(screen.getByRole('button', { name: 'Compact conversation' }));
    expect(actions.onCompact).toHaveBeenCalledOnce();
  });

  it('confirms permanent last-message removal', async () => {
    const user = userEvent.setup();
    const actions = renderActions();

    await user.click(screen.getByRole('button', { name: 'Actions for EarthScope NDP' }));
    await user.click(screen.getByRole('menuitem', { name: 'Remove last message' }));

    expect(screen.getByRole('alertdialog')).toHaveTextContent('permanently remove');
    await user.click(screen.getByRole('button', { name: 'Remove message' }));
    expect(actions.onUndo).toHaveBeenCalledOnce();
  });

  it('keeps a failed confirmation open so the user can retry or cancel', async () => {
    const user = userEvent.setup();
    const actions = renderActions();
    actions.onCompact.mockRejectedValueOnce(new Error('Service unavailable'));

    await user.click(screen.getByRole('button', { name: 'Actions for EarthScope NDP' }));
    await user.click(screen.getByRole('menuitem', { name: 'Compact conversation' }));
    await user.click(screen.getByRole('button', { name: 'Compact conversation' }));

    expect(actions.onCompact).toHaveBeenCalledOnce();
    expect(screen.getByRole('alertdialog')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Compact conversation' })).toBeEnabled();
  });

  it('creates an expiring read-only share link', async () => {
    const user = userEvent.setup();
    const actions = renderActions();

    await user.click(screen.getByRole('button', { name: 'Actions for EarthScope NDP' }));
    await user.click(screen.getByRole('menuitem', { name: 'Share read-only link' }));
    expect(screen.getByRole('dialog')).toHaveTextContent('Anyone with the link can view it');
    await user.click(screen.getByRole('button', { name: 'Create share link' }));

    expect(actions.onShare).toHaveBeenCalledWith(604800);
    expect(screen.getByDisplayValue('http://127.0.0.1:8787/v1/shared/shr_test')).toHaveAttribute(
      'readonly',
    );
  });
});
