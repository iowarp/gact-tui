import { cleanup, render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { TooltipProvider } from '@/components/ui/tooltip';
import { ClioSessionActions } from './session-actions';

afterEach(cleanup);

function renderActions() {
  const actions = {
    onFork: vi.fn().mockResolvedValue(undefined),
    onCompact: vi.fn().mockResolvedValue(undefined),
    onShare: vi.fn().mockResolvedValue('http://127.0.0.1/v1/shared/shr_test'),
    onUndo: vi.fn().mockResolvedValue(undefined),
  };
  render(
    <TooltipProvider>
      <ClioSessionActions {...actions} title="EarthScope NDP" />
    </TooltipProvider>,
  );
  return actions;
}

describe('ClioSessionActions', () => {
  it('branches without destructive confirmation', async () => {
    const user = userEvent.setup();
    const actions = renderActions();

    await user.click(screen.getByRole('button', { name: 'Actions for EarthScope NDP' }));
    await user.click(screen.getByRole('menuitem', { name: 'Fork into a new conversation' }));

    expect(actions.onFork).toHaveBeenCalledOnce();
    expect(screen.queryByRole('alertdialog')).not.toBeInTheDocument();
  });

  it('confirms transcript compaction with explicit consequences', async () => {
    const user = userEvent.setup();
    const actions = renderActions();

    await user.click(screen.getByRole('button', { name: 'Actions for EarthScope NDP' }));
    await user.click(screen.getByRole('menuitem', { name: 'Compact conversation…' }));

    expect(screen.getByRole('alertdialog')).toHaveTextContent(
      'appends a checkpoint; earlier messages stay in the transcript',
    );
    await user.click(screen.getByRole('button', { name: 'Compact conversation' }));
    expect(actions.onCompact).toHaveBeenCalledOnce();
  });

  it('confirms permanent last-message removal', async () => {
    const user = userEvent.setup();
    const actions = renderActions();

    await user.click(screen.getByRole('button', { name: 'Actions for EarthScope NDP' }));
    await user.click(screen.getByRole('menuitem', { name: 'Remove last message…' }));

    expect(screen.getByRole('alertdialog')).toHaveTextContent('permanently remove');
    await user.click(screen.getByRole('button', { name: 'Remove message' }));
    expect(actions.onUndo).toHaveBeenCalledOnce();
  });

  it('keeps a failed confirmation open so the user can retry or cancel', async () => {
    const user = userEvent.setup();
    const actions = renderActions();
    actions.onCompact.mockRejectedValueOnce(new Error('Service unavailable'));

    await user.click(screen.getByRole('button', { name: 'Actions for EarthScope NDP' }));
    await user.click(screen.getByRole('menuitem', { name: 'Compact conversation…' }));
    await user.click(screen.getByRole('button', { name: 'Compact conversation' }));

    expect(actions.onCompact).toHaveBeenCalledOnce();
    expect(screen.getByRole('alertdialog')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Compact conversation' })).toBeEnabled();
  });

  it('opens from Alt . and selects a row by its letter', async () => {
    const user = userEvent.setup();
    const actions = renderActions();

    await user.keyboard('{Alt>}.{/Alt}');
    expect(
      await screen.findByRole('menuitem', { name: 'Fork into a new conversation' }),
    ).toHaveAttribute('aria-keyshortcuts', 'F');
    await user.keyboard('f');

    expect(actions.onFork).toHaveBeenCalledOnce();
    expect(screen.queryByRole('menu')).not.toBeInTheDocument();
  });

  it('offers the system terminal only when the host provides one', async () => {
    const user = userEvent.setup();
    const onOpenSystemTerminal = vi.fn().mockResolvedValue(undefined);
    const { rerender } = render(
      <ClioSessionActions
        onCompact={vi.fn()}
        onShare={vi.fn()}
        onUndo={vi.fn()}
        title="EarthScope NDP"
      />,
    );
    await user.click(screen.getByRole('button', { name: 'Actions for EarthScope NDP' }));
    expect(screen.queryByRole('menuitem', { name: 'Open in system terminal' })).toBeNull();
    await user.keyboard('{Escape}');

    rerender(
      <ClioSessionActions
        onCompact={vi.fn()}
        onOpenSystemTerminal={onOpenSystemTerminal}
        onShare={vi.fn()}
        onUndo={vi.fn()}
        title="EarthScope NDP"
      />,
    );
    await user.click(screen.getByRole('button', { name: 'Actions for EarthScope NDP' }));
    expect(screen.getByRole('menuitem', { name: 'Open in system terminal' })).toHaveAttribute(
      'aria-keyshortcuts',
      'T',
    );
    await user.keyboard('t');
    expect(onOpenSystemTerminal).toHaveBeenCalledOnce();
  });

  it('creates an expiring read-only share link', async () => {
    const user = userEvent.setup();
    const actions = renderActions();

    await user.click(screen.getByRole('button', { name: 'Actions for EarthScope NDP' }));
    await user.click(screen.getByRole('menuitem', { name: 'Share read-only link' }));
    expect(screen.getByRole('dialog')).toHaveTextContent('Anyone with the link can view it');
    await user.click(screen.getByRole('button', { name: 'Create share link' }));

    expect(actions.onShare).toHaveBeenCalledWith(604800);
    expect(screen.getByDisplayValue('http://127.0.0.1/v1/shared/shr_test')).toHaveAttribute(
      'readonly',
    );
    // The link carries its expiry, so it is no longer a choice.
    expect(screen.getByRole('combobox', { name: 'Link expires' })).toBeDisabled();
    expect(screen.getByRole('combobox', { name: 'Link expires' })).toHaveTextContent('In 7 days');

    // Done is the lone button and takes plain Enter.
    expect(screen.getByRole('button', { name: /^Done/ })).toHaveFocus();
    await user.keyboard('{Enter}');
    expect(screen.queryByRole('dialog')).not.toBeInTheDocument();
  });
});
