import type { Task } from '@clio/core/v3';
import { cleanup, render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, describe, expect, it } from 'vitest';
import { ConversationProcessSequence } from './conversation-process-sequence';

afterEach(cleanup);

function renderTask(task?: Task) {
  render(
    <ConversationProcessSequence
      block={{ id: 'block_task', type: 'task', task_id: 'task_1' }}
      subagents={{}}
      tasks={task ? { task_1: task } : {}}
      tools={{}}
    />,
  );
}

const task: Task = {
  id: 'task_1',
  session_id: 'sess_1',
  title: 'Review station quality',
  state: 'completed',
  detail: 'Evidence retained with source identity.',
};

describe('ConversationProcessSequence task blocks', () => {
  it('reaches a task detail from the keyboard rather than a hover title', async () => {
    const user = userEvent.setup();
    renderTask(task);

    const trigger = screen.getByRole('button', { name: /Review station quality/ });
    expect(screen.queryByText('Evidence retained with source identity.')).not.toBeInTheDocument();
    await user.tab();
    expect(trigger).toHaveFocus();
    await user.keyboard('{Enter}');
    expect(screen.getByText('Evidence retained with source identity.')).toBeVisible();
  });

  it('says a task reported no detail instead of showing an empty disclosure', async () => {
    const user = userEvent.setup();
    renderTask({ ...task, detail: '' });

    await user.click(screen.getByRole('button', { name: /Review station quality/ }));

    expect(screen.getByText('No task detail was reported.')).toBeVisible();
  });

  it('labels the task state for a reader rather than echoing the wire value', () => {
    renderTask({ ...task, state: 'waiting_permission' });

    expect(screen.getByText('Permission needed')).toBeVisible();
    expect(screen.queryByText('waiting_permission')).not.toBeInTheDocument();
  });

  it('names an unavailable task without inventing a state for it', () => {
    renderTask(undefined);

    expect(screen.getByRole('button', { name: /Task unavailable/ })).toBeVisible();
    expect(screen.getByText('Unavailable')).toBeVisible();
  });
});
