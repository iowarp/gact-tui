import { cleanup, render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { ClioDraftActions } from './draft-actions';

afterEach(cleanup);

describe('ClioDraftActions', () => {
  it('opens workspace views before a session exists', async () => {
    const user = userEvent.setup();
    const onOpen = vi.fn();
    render(<ClioDraftActions onOpen={onOpen} />);
    for (const [label, section] of [
      ['Workspace files', 'files'],
      ['Attached resources', 'resources'],
      ['Agent blueprints', 'blueprints'],
    ]) {
      await user.click(screen.getByRole('button', { name: 'New conversation actions' }));
      await user.click(screen.getByRole('menuitem', { name: label }));
      expect(onOpen).toHaveBeenLastCalledWith(section);
    }
    expect(onOpen).toHaveBeenCalledTimes(3);
  });

  it('only offers a system terminal when the host supports it', async () => {
    const user = userEvent.setup();
    const onOpenSystemTerminal = vi.fn().mockResolvedValue(undefined);
    const view = render(<ClioDraftActions onOpen={vi.fn()} />);
    await user.click(screen.getByRole('button', { name: 'New conversation actions' }));
    expect(screen.queryByRole('menuitem', { name: 'Open in system terminal' })).toBeNull();
    await user.keyboard('{Escape}');
    view.rerender(
      <ClioDraftActions onOpen={vi.fn()} onOpenSystemTerminal={onOpenSystemTerminal} />,
    );
    await user.click(screen.getByRole('button', { name: 'New conversation actions' }));
    await user.click(screen.getByRole('menuitem', { name: 'Open in system terminal' }));
    expect(onOpenSystemTerminal).toHaveBeenCalledOnce();
  });

  it('disables actions while the first message is being sent', () => {
    render(<ClioDraftActions disabled onOpen={vi.fn()} />);
    expect(screen.getByRole('button', { name: 'New conversation actions' })).toBeDisabled();
  });
});
