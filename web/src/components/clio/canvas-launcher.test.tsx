import type { SubagentRun } from '@clio/core/v3';
import { cleanup, render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { CanvasLauncher } from './workbench-resource-browser';

afterEach(() => {
  cleanup();
});

const watcher: SubagentRun = {
  id: 'task_watch',
  session_id: 'sess_1',
  child_session_id: 'sess_watch',
  title: 'SPOTTER watcher',
  state: 'running',
};

describe('CanvasLauncher child agents', () => {
  it('opens a child agent of this session as a canvas tab from the Add to canvas menu', async () => {
    const user = userEvent.setup();
    const onOpenSubagent = vi.fn();
    render(
      <CanvasLauncher
        onOpen={vi.fn()}
        onOpenSubagent={onOpenSubagent}
        subagents={[watcher, { ...watcher, id: 'task_no_child', child_session_id: undefined }]}
      />,
    );

    await user.click(screen.getByRole('button', { name: 'Open a canvas tab' }));
    const trigger = await screen.findByRole('menuitem', { name: /Child agent/ });
    trigger.focus();
    await user.keyboard('{ArrowRight}');
    await user.click(await screen.findByRole('menuitem', { name: /SPOTTER watcher/ }));

    expect(onOpenSubagent).toHaveBeenCalledTimes(1);
    expect(onOpenSubagent).toHaveBeenCalledWith(expect.objectContaining({ id: 'task_watch' }));
  });

  it('shows the entry disabled when the session has no child agents yet', async () => {
    const user = userEvent.setup();
    render(<CanvasLauncher onOpen={vi.fn()} onOpenSubagent={vi.fn()} subagents={[]} />);

    await user.click(screen.getByRole('button', { name: 'Open a canvas tab' }));
    const entry = await screen.findByRole('menuitem', { name: /Child agent/ });
    expect(entry).toHaveAttribute('aria-disabled', 'true');
    expect(entry).toHaveTextContent('None yet');
  });
});
