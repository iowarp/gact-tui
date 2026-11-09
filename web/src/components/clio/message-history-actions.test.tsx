import { cleanup, render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { TooltipProvider } from '@/components/ui/tooltip';
import { ClioMessageHistoryActions } from './message-history-actions';

afterEach(cleanup);

describe('ClioMessageHistoryActions', () => {
  it('forks immediately from the selected message', async () => {
    const user = userEvent.setup();
    const onFork = vi.fn().mockResolvedValue(undefined);

    render(<ClioMessageHistoryActions onFork={onFork} />, { wrapper: TooltipProvider });
    await user.click(screen.getByRole('button', { name: 'Fork into a new conversation' }));

    expect(onFork).toHaveBeenCalledOnce();
    expect(screen.queryByRole('alertdialog')).not.toBeInTheDocument();
  });

  it('requires explicit confirmation before removing later messages', async () => {
    const user = userEvent.setup();
    const onRewind = vi.fn().mockResolvedValue(undefined);

    render(<ClioMessageHistoryActions onRewind={onRewind} />, { wrapper: TooltipProvider });
    expect(screen.queryByRole('button', { name: 'Fork into a new conversation' })).not.toBeInTheDocument();
    await user.click(screen.getByRole('button', { name: 'Rewind to here' }));

    expect(onRewind).not.toHaveBeenCalled();
    expect(screen.getByRole('alertdialog')).toHaveTextContent(
      'Files and artifacts already created or edited are kept.',
    );
    await user.click(screen.getByRole('button', { name: 'Remove later messages' }));
    expect(onRewind).toHaveBeenCalledOnce();
  });

  it('keeps a failed rewind confirmation open', async () => {
    const user = userEvent.setup();
    const onRewind = vi.fn().mockRejectedValue(new Error('Service unavailable'));

    render(<ClioMessageHistoryActions onRewind={onRewind} />, { wrapper: TooltipProvider });
    await user.click(screen.getByRole('button', { name: 'Rewind to here' }));
    await user.click(screen.getByRole('button', { name: 'Remove later messages' }));

    expect(screen.getByRole('alertdialog')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Remove later messages' })).toBeEnabled();
  });
});
