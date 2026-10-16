import { cleanup, render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, expect, it, vi } from 'vitest';
import type { AsyncProcess } from '@clio/core/v3';
import { AsyncTaskList } from './async-task-list';

afterEach(cleanup);
const task: AsyncProcess = {
  id: 'owned',
  handle: 'task_owned',
  kind: 'agent',
  task_kind: 'Subagent',
  title: 'Worker',
  description: 'Inspect the retained assignment',
  status: 'running',
  live_state: 'running',
  effective_status: 'running',
  supported_actions: ['pause', 'cancel'],
  metadata: {},
};

it('pauses model execution without cancelling the task and suppresses duplicate requests', async () => {
  let finish!: () => void;
  const control = vi.fn(
    () =>
      new Promise<void>((resolve) => {
        finish = resolve;
      }),
  );
  const cancel = vi.fn();
  render(<AsyncTaskList processes={[task]} onControlTask={control} onCancelTask={cancel} />);
  const user = userEvent.setup();
  const button = screen.getByRole('button', { name: `pause Subagent: ${task.title}` });
  await user.click(button);
  expect(control).toHaveBeenCalledTimes(1);
  expect(control).toHaveBeenCalledWith(task, 'pause');
  expect(cancel).not.toHaveBeenCalled();
  expect(button).toBeDisabled();
  expect(screen.getByText('Subagent · Pause requested')).toBeVisible();
  await user.click(button);
  expect(control).toHaveBeenCalledTimes(1);
  finish();
  await waitFor(() => expect(button).not.toBeDisabled());
});

it('shows a held run honestly and resumes on the same task', async () => {
  const paused: AsyncProcess = {
    ...task,
    effective_status: 'paused',
    live_state: 'paused',
    supported_actions: ['resume', 'cancel'],
  };
  const control = vi.fn(async () => {});
  const view = render(<AsyncTaskList processes={[paused]} onControlTask={control} />);
  expect(screen.getByText('Subagent · Paused')).toBeVisible();
  expect(view.container.querySelector('.animate-spin')).toBeNull();
  await userEvent.click(screen.getByRole('button', { name: `resume Subagent: ${task.title}` }));
  expect(control).toHaveBeenCalledTimes(1);
  expect(control).toHaveBeenCalledWith(paused, 'resume');
});

it('requires confirmation before creating a linked successor', async () => {
  const completed: AsyncProcess = {
    ...task,
    status: 'completed',
    effective_status: 'completed',
    live_state: 'completed',
    supported_actions: ['restart'],
  };
  const control = vi.fn(async () => {});
  render(<AsyncTaskList processes={[completed]} onControlTask={control} />);
  await userEvent.click(screen.getByRole('button', { name: `restart Subagent: ${task.title}` }));
  expect(control).not.toHaveBeenCalled();
  expect(screen.getByRole('alertdialog')).toHaveTextContent(
    'An active assignment is cancelled and settled first. The linked assignment keeps its context. Check uncertain effects before retrying operations.',
  );
  expect(screen.getByRole('alertdialog')).toHaveTextContent(task.title);
  expect(screen.queryByRole('region', { name: 'Task assignment' })).toBeNull();
  await userEvent.click(screen.getByRole('button', { name: 'View assignment' }));
  expect(screen.getByRole('region', { name: 'Task assignment' }).textContent).toBe(
    task.description,
  );
  await userEvent.click(screen.getByRole('button', { name: 'Keep this run' }));
  expect(control).not.toHaveBeenCalled();
  await userEvent.click(screen.getByRole('button', { name: `restart Subagent: ${task.title}` }));
  await userEvent.click(screen.getByRole('button', { name: 'Restart subagent' }));
  expect(control).toHaveBeenCalledTimes(1);
  expect(control).toHaveBeenCalledWith(completed, 'restart');
});
