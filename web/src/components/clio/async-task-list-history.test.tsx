import type { AsyncProcess, SubagentRun } from '@clio/core/v3';
import { cleanup, render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { useState } from 'react';
import { afterEach, expect, it, vi } from 'vitest';
import { AsyncTaskList, type TaskPageControls } from './async-task-list';

afterEach(cleanup);

const emptyHistory: NonNullable<TaskPageControls['history']> = {
  loaded: true,
  visible: false,
  toggle: vi.fn(),
  items: [],
  hasMore: false,
  pending: false,
  loadMore: async () => {},
  error: '',
};

it('hides a verified empty history even while current work is running', () => {
  render(
    <AsyncTaskList
      processes={[current]}
      pagination={{
        hasMore: false,
        pending: false,
        loadMore: async () => {},
        history: emptyHistory,
      }}
    />,
  );
  expect(screen.getByText(current.title)).toBeVisible();
  expect(screen.queryByRole('button', { name: 'Completed work' })).toBeNull();
});

it('keeps lazy history discoverable, then removes it once an empty read settles', () => {
  const view = render(
    <AsyncTaskList
      processes={[]}
      pagination={{
        hasMore: false,
        pending: false,
        loadMore: async () => {},
        history: { ...emptyHistory, loaded: false },
      }}
    />,
  );
  expect(screen.getByRole('button', { name: 'Completed work' })).toBeVisible();
  view.rerender(
    <AsyncTaskList
      processes={[]}
      pagination={{
        hasMore: false,
        pending: false,
        loadMore: async () => {},
        history: emptyHistory,
      }}
    />,
  );
  expect(screen.queryByRole('button', { name: 'Completed work' })).toBeNull();
});

it('does not hide a history read failure as an empty category', () => {
  render(
    <AsyncTaskList
      processes={[]}
      pagination={{
        hasMore: false,
        pending: false,
        loadMore: async () => {},
        history: { ...emptyHistory, visible: true, error: 'History read failed' },
      }}
    />,
  );
  expect(screen.getByRole('button', { name: 'Completed work' })).toBeVisible();
  expect(screen.getByRole('alert')).toHaveTextContent('History read failed');
});

const current: AsyncProcess = {
  id: 'current',
  handle: 'task_current',
  kind: 'mcp-task',
  task_kind: 'MCP',
  title: 'Current source read',
  status: 'running',
  live_state: 'running',
  metadata: {},
};
const completed: AsyncProcess = {
  ...current,
  id: 'completed',
  handle: 'task_completed',
  title: 'Failed source read',
  status: 'failed',
  live_state: 'failed',
};
const child: SubagentRun = {
  id: 'child',
  session_id: 'parent',
  child_session_id: 'flow',
  title: 'Research flow',
  state: 'completed',
};

it('keeps completed processes and stream-only children inside a keyboard disclosure', async () => {
  const toggle = vi.fn();
  function Work() {
    const [visible, setVisible] = useState(false);
    return (
      <AsyncTaskList
        processes={[current, completed]}
        subagents={[child]}
        pagination={{
          hasMore: false,
          pending: false,
          loadMore: async () => {},
          history: {
            visible,
            toggle: () => {
              toggle();
              setVisible((value) => !value);
            },
            items: [completed],
            hasMore: false,
            pending: false,
            loadMore: async () => {},
            error: '',
          },
        }}
      />
    );
  }
  render(<Work />);
  expect(screen.getByText(current.title)).toBeVisible();
  expect(screen.queryByText(completed.title)).toBeNull();
  expect(screen.queryByText(child.title!)).toBeNull();
  const disclosure = screen.getByRole('button', { name: 'Completed work' });
  expect(disclosure).toHaveAttribute('aria-expanded', 'false');
  disclosure.focus();
  await userEvent.keyboard('{Enter}');
  expect(disclosure).toHaveAttribute('aria-expanded', 'true');
  expect(screen.getAllByText(completed.title)).toHaveLength(1);
  expect(screen.getByText(child.title!)).toBeVisible();
  expect(screen.getByText(current.title)).toBeVisible();
  await userEvent.keyboard(' ');
  expect(disclosure).toHaveAttribute('aria-expanded', 'false');
  expect(screen.queryByText(completed.title)).toBeNull();
  expect(toggle).toHaveBeenCalledTimes(2);
  expect(
    screen.queryByRole('button', { name: /Show completed work|Hide completed work/ }),
  ).toBeNull();
});

it('does not claim history is empty while an empty page still has a continuation', () => {
  render(
    <AsyncTaskList
      processes={[]}
      pagination={{
        hasMore: false,
        pending: false,
        loadMore: async () => {},
        history: {
          visible: true,
          toggle: vi.fn(),
          items: [],
          hasMore: true,
          pending: false,
          loadMore: async () => {},
          error: '',
        },
      }}
    />,
  );
  expect(screen.queryByText('No completed work.')).toBeNull();
  expect(screen.getByRole('button', { name: 'Load more completed work' })).toBeVisible();
});
