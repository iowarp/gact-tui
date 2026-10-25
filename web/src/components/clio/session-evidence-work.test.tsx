import type { AsyncProcess, SubagentRun } from '@clio/core/v3';
import { cleanup, render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, expect, it, vi } from 'vitest';
import { sessionEvidenceItems } from './session-evidence-items';

afterEach(cleanup);

it('keeps a directly spawned workflow in the single Work history and opens its recorded run', async () => {
  const open = vi.fn();
  const task: AsyncProcess = {
    id: 'task_flow',
    handle: 'task_flow',
    child_session_id: 'flow',
    kind: 'agent',
    task_kind: 'Subagent',
    title: 'Research workflow',
    live_state: 'completed',
    status: 'completed',
    metadata: {},
    flow: { id: 'deep-research' },
  };
  const child: SubagentRun = {
    id: 'spawn_observation',
    session_id: 'parent',
    child_session_id: 'flow',
    title: task.title,
    state: 'completed',
  };
  const items = sessionEvidenceItems({
    outputs: [],
    files: [],
    diffs: [],
    plans: [],
    sources: [],
    runs: [],
    tasks: [],
    tools: [],
    subagents: [child],
    backgroundProcesses: [],
    onOpenFlow: open,
    workPages: {
      hasMore: false,
      pending: false,
      loadMore: async () => {},
      history: {
        visible: true,
        toggle: vi.fn(),
        items: [task],
        hasMore: false,
        pending: false,
        loadMore: async () => {},
        error: '',
      },
    },
  });
  expect(items.some((item) => item.id === 'child-agents')).toBe(false);
  const background = items.filter((item) => item.id === 'background');
  expect(background).toHaveLength(1);
  render(<>{background[0]!.content}</>);
  expect(screen.getAllByRole('button', { name: 'Completed work' })).toHaveLength(1);
  expect(screen.getAllByRole('button', { name: `Task details: ${task.title}` })).toHaveLength(1);
  expect(screen.getByText('Deep research run')).toBeVisible();
  expect(screen.queryByText('No completed work.')).toBeNull();
  await userEvent.click(screen.getByRole('button', { name: `Task details: ${task.title}` }));
  await userEvent.click(screen.getByRole('button', { name: /^Open the deep research run:/ }));
  expect(open).toHaveBeenCalledWith('task_flow', 'Deep research run');
});
