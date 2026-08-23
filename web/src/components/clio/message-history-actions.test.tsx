import { cleanup, render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { ClioMessageHistoryActions } from './message-history-actions';

afterEach(cleanup);

describe('ClioMessageHistoryActions', () => {
  it('branches immediately from the selected message', async () => {
    const user = userEvent.setup();
    const onFork = vi.fn().mockResolvedValue(undefined);

    render(<ClioMessageHistoryActions onFork={onFork} />);
    await user.click(screen.getByRole('button', { name: 'Branch from here' }));

    expect(onFork).toHaveBeenCalledOnce();
    expect(screen.queryByRole('alertdialog')).not.toBeInTheDocument();
  });

  it('requires explicit confirmation before removing later messages', async () => {
    const user = userEvent.setup();
    const onRewind = vi.fn().mockResolvedValue(undefined);

    render(<ClioMessageHistoryActions onRewind={onRewind} />);
    await user.click(screen.getByRole('button', { name: 'Rewind to here' }));

    expect(onRewind).not.toHaveBeenCalled();
    expect(screen.getByRole('alertdialog')).toHaveTextContent(
      'permanently remove every message after this point',
    );
    await user.click(screen.getByRole('button', { name: 'Remove later messages' }));
    expect(onRewind).toHaveBeenCalledOnce();
  });

  it('keeps a failed rewind confirmation open', async () => {
    const user = userEvent.setup();
    const onRewind = vi.fn().mockRejectedValue(new Error('Service unavailable'));

    render(<ClioMessageHistoryActions onRewind={onRewind} />);
    await user.click(screen.getByRole('button', { name: 'Rewind to here' }));
    await user.click(screen.getByRole('button', { name: 'Remove later messages' }));

    expect(screen.getByRole('alertdialog')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Remove later messages' })).toBeEnabled();
  });
});
