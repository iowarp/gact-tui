import type { AsyncProcess, SubagentRun } from '@clio/core/v3';
import { act, cleanup, render, screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, expect, it, vi } from 'vitest';
import { AsyncTaskList } from './async-task-list';
import { asyncProcessDetail } from './observability-activity';
import { useWorkTaskFocus } from './work-task-focus';

afterEach(cleanup);

it('keeps a visibility error in technical details without repeating it as progress', async () => {
  const issue = 'Server returned an error response';
  const uncertain: AsyncProcess = {
    ...task,
    id: 'external-job',
    handle: 'task_external',
    kind: 'mcp',
    task_kind: 'MCP',
    title: 'Prepare dataset',
    child_session_id: undefined,
    effective_status: 'task_state_uncertain',
    live_state: 'task_state_uncertain',
    status: 'working',
    raw_status: 'working',
    connection_freshness: 'lost',
    progress: { message: issue },
    error_reason: issue,
    supported_actions: ['observe', 'cancel'],
  };
  render(<AsyncTaskList processes={[uncertain]} />);
  expect(screen.getByText('Tool: Needs inspection')).toBeVisible();
  expect(screen.queryByText(issue)).toBeNull();
  await userEvent.click(screen.getByRole('button', { name: 'Task details: Prepare dataset' }));
  expect(screen.queryByText(issue)).toBeNull();
  expect(screen.getByText(/Execution or cleanup could not be confirmed/)).toHaveAttribute(
    'role',
    'status',
  );
  await userEvent.click(screen.getByRole('button', { name: 'Technical details' }));
  expect(screen.getAllByText(issue)).toHaveLength(1);
});

it('retains numeric progress when a repeated visibility error is disclosed separately', () => {
  const issue = 'Server returned an error response';
  render(
    <AsyncTaskList
      processes={[
        {
          ...task,
          kind: 'mcp',
          task_kind: 'Indexing',
          child_session_id: undefined,
          effective_status: 'task_state_uncertain',
          live_state: 'task_state_uncertain',
          status: 'working',
          progress: { completed: 42, unit: 'entries', message: issue },
          error_reason: issue,
          supported_actions: ['observe', 'cancel'],
        },
      ]}
    />,
  );
  expect(screen.getByText('Indexing: Needs inspection — 42 entries indexed')).toBeVisible();
  expect(screen.queryByText(issue)).toBeNull();
});

const assignment =
  'Call shell_bash(command="/home/owned/very-long-source-path/python script.py").\nRetain all output and the original assignment. '.repeat(
    20,
  );
const task: AsyncProcess = {
  id: 'worker',
  handle: 'task_original_handle',
  task_kind: 'Subagent',
  kind: 'agent',
  title: 'Worker #1',
  description: assignment,
  child_session_id: 'child',
  effective_status: 'paused',
  live_state: 'paused',
  status: 'paused',
  raw_status: 'paused',
  host: 'owned-host',
  supported_actions: ['resume', 'cancel'],
  metadata: {},
};
const child: SubagentRun = {
  id: 'worker',
  session_id: 'parent',
  child_session_id: 'child',
  title: 'Worker #1',
  state: 'paused',
  task: assignment,
};

it.each(['cancelled', 'completed'] as const)(
  'opens a %s child from its Task record without a live subagent projection',
  async (state) => {
    const open = vi.fn();
    const historical: AsyncProcess = {
      ...task,
      id: `task_${state}`,
      handle: `task_${state}`,
      parent_session_id: 'parent',
      live_state: state,
      effective_status: state,
      status: state,
      supported_actions: ['restart'],
    };
    render(<AsyncTaskList processes={[historical]} subagents={[]} onOpenSubagent={open} />);
    expect(screen.queryByRole('button', { name: 'Open child conversation Worker #1' })).toBeNull();
    await userEvent.click(screen.getByRole('button', { name: 'Task details: Worker #1' }));
    await userEvent.click(
      screen.getByRole('button', { name: 'Open child conversation Worker #1' }),
    );
    expect(open).toHaveBeenCalledWith(
      expect.objectContaining({
        id: historical.handle,
        session_id: 'parent',
        child_session_id: 'child',
        state,
      }),
      'canvas',
    );
  },
);

it('shows a question waiting for its answer and reveals the stored answer on demand', async () => {
  const question: AsyncProcess = {
    ...task,
    id: 'question_1',
    handle: 'task_question_1',
    kind: 'question',
    task_kind: 'Question',
    title: 'Which dataset?',
    description: 'Which dataset should the analysis use?',
    effective_status: 'input_required',
    live_state: 'waiting_user',
    status: 'pending',
    child_session_id: undefined,
    supported_actions: ['observe', 'wait', 'result', 'cancel'],
    progress: { message: 'Waiting for your answer' },
  };
  const view = render(<AsyncTaskList processes={[question]} />);
  expect(screen.getByText('Question: Waiting for your answer')).toBeVisible();
  const details = screen.getByRole('button', { name: 'Task details: Which dataset?' });
  expect(details).toHaveAttribute('aria-expanded', 'false');
  view.rerender(
    <AsyncTaskList
      processes={[
        {
          ...question,
          effective_status: 'completed',
          live_state: 'completed',
          status: 'answered',
          progress: {},
          result: { answer: 'Use the October dataset.' },
        },
      ]}
    />,
  );
  expect(screen.queryByText('Use the October dataset.')).toBeNull();
  await userEvent.click(details);
  expect(screen.getByRole('region', { name: 'Result: Which dataset?' })).toHaveTextContent(
    'Use the October dataset.',
  );
  expect(screen.queryByRole('button', { name: /Open child conversation/ })).toBeNull();
});

it('shows one compact task row and discloses complete assignments and technical identity by keyboard', async () => {
  const user = userEvent.setup();
  render(<AsyncTaskList compact processes={[task]} subagents={[child]} />);
  const row = screen.getByRole('button', { name: 'Task details: Worker #1' });
  expect(row).toHaveAttribute('aria-expanded', 'false');
  expect(screen.queryByRole('region', { name: 'Assignment: Worker #1' })).toBeNull();
  expect(screen.queryByText(task.handle!)).toBeNull();
  row.focus();
  await user.keyboard('{Enter}');
  expect(row).toHaveAttribute('aria-expanded', 'true');
  expect(screen.getByRole('region', { name: 'Assignment: Worker #1' }).textContent).toBe(
    assignment,
  );
  const technical = screen.getByRole('button', { name: 'Technical details' });
  expect(technical).toHaveAttribute('aria-expanded', 'false');
  technical.focus();
  await user.keyboard(' ');
  expect(screen.getByText(task.handle!)).toBeVisible();
  expect(screen.getByText('owned-host')).toBeVisible();
  row.focus();
  await user.keyboard('{Enter}');
  expect(screen.queryByText(task.handle!)).toBeNull();
});

it('opens the exact matched child in a workspace tab and center while controls stay independent', async () => {
  const user = userEvent.setup();
  const open = vi.fn();
  const control = vi.fn(async () => {});
  render(
    <AsyncTaskList
      processes={[task]}
      subagents={[child]}
      onOpenSubagent={open}
      onControlTask={control}
    />,
  );
  const details = screen.getByRole('button', { name: 'Task details: Worker #1' });
  await user.click(screen.getByRole('button', { name: 'resume Subagent: Worker #1' }));
  expect(control).toHaveBeenCalledWith(task, 'resume');
  expect(details).toHaveAttribute('aria-expanded', 'false');
  await user.click(details);
  await user.click(screen.getByRole('button', { name: 'Open child conversation Worker #1' }));
  expect(open).toHaveBeenLastCalledWith(child, 'canvas');
  await user.keyboard('{Shift>}');
  await user.click(screen.getByRole('button', { name: 'Open child conversation Worker #1' }));
  await user.keyboard('{/Shift}');
  expect(open).toHaveBeenLastCalledWith(child, 'conversation');
  await user.click(screen.getByRole('button', { name: 'Open Worker #1 in the center' }));
  expect(open).toHaveBeenLastCalledWith(child, 'conversation');
  expect(open).toHaveBeenCalledTimes(3);
});

it('keeps legacy child discovery and opening available without unsupported lifecycle actions', async () => {
  const open = vi.fn();
  render(
    <AsyncTaskList
      processes={[]}
      subagents={[child]}
      onOpenSubagent={open}
      onCancelTask={vi.fn()}
      onControlTask={vi.fn()}
    />,
  );
  expect(screen.queryByRole('button', { name: /^Cancel/ })).toBeNull();
  expect(screen.getByText('Subagent: Paused')).toBeVisible();
  expect(screen.queryByRole('button', { name: 'Open child conversation Worker #1' })).toBeNull();
  await userEvent.click(screen.getByRole('button', { name: 'Task details: Worker #1' }));
  expect(screen.queryByRole('button', { name: 'Technical details' })).toBeNull();
  await userEvent.click(screen.getByRole('button', { name: 'Open child conversation Worker #1' }));
  expect(open).toHaveBeenCalledWith(child, 'canvas');
});

it('reveals settled results and errors without replacing a reader-opened assignment on refresh', async () => {
  const failed = {
    ...task,
    effective_status: 'failed',
    error_reason: 'Owner failed during transfer',
    result: { answer_excerpt: 'Retained partial output' },
  };
  const view = render(<AsyncTaskList processes={[task]} />);
  await userEvent.click(screen.getByRole('button', { name: 'Task details: Worker #1' }));
  view.rerender(<AsyncTaskList processes={[failed]} />);
  expect(screen.getByRole('button', { name: 'Task details: Worker #1' })).toHaveAttribute(
    'aria-expanded',
    'true',
  );
  expect(screen.getByRole('region', { name: 'Assignment: Worker #1' }).textContent).toBe(
    assignment,
  );
  expect(screen.getByRole('region', { name: 'Result: Worker #1' })).toHaveTextContent(
    'Retained partial output',
  );
  expect(screen.getByText('Owner failed during transfer')).toBeVisible();
});

it('reports cancellation failure and permits a deliberate retry without expanding the row', async () => {
  const user = userEvent.setup();
  const cancel = vi
    .fn()
    .mockRejectedValueOnce(new Error('Owner unavailable'))
    .mockResolvedValueOnce(undefined);
  render(<AsyncTaskList processes={[task]} onCancelTask={cancel} />);
  for (const attempt of [1, 2]) {
    await user.click(screen.getByRole('button', { name: 'Cancel Subagent: Worker #1' }));
    expect(screen.getByRole('alertdialog')).toHaveTextContent(task.title);
    expect(screen.queryByRole('region', { name: 'Task assignment' })).toBeNull();
    await user.click(screen.getByRole('button', { name: 'View assignment' }));
    expect(
      within(screen.getByRole('alertdialog')).getByRole('region', { name: 'Task assignment' })
        .textContent,
    ).toBe(assignment);
    await user.click(screen.getByRole('button', { name: 'Cancel task' }));
    expect(cancel).toHaveBeenCalledTimes(attempt);
    if (attempt === 1)
      expect(await screen.findByRole('alert')).toHaveTextContent('Owner unavailable');
  }
  expect(screen.getByRole('button', { name: 'Cancel Subagent: Worker #1' })).toBeDisabled();
  expect(screen.getByRole('button', { name: 'Task details: Worker #1' })).toHaveAttribute(
    'aria-expanded',
    'false',
  );
});

it('identifies missing older assignments explicitly only when details are opened', async () => {
  render(
    <AsyncTaskList processes={[{ ...task, description: undefined, description_missing: true }]} />,
  );
  expect(screen.queryByText('Description unavailable for this older task')).toBeNull();
  await userEvent.click(screen.getByRole('button', { name: 'Task details: Worker #1' }));
  expect(screen.getByText('Description unavailable for this older task')).toBeVisible();
});

it('names a task that runs a flow by its title and opens the run view', async () => {
  const user = userEvent.setup();
  const openFlow = vi.fn();
  const openChild = vi.fn();
  const flowTask: AsyncProcess = {
    ...task,
    id: 'task_workflow_handle',
    handle: 'task_workflow_handle',
    title: 'Field sites workflow',
    flow: { id: 'workflow', status: 'running' },
    effective_status: 'running',
    live_state: 'running',
    status: 'running',
    raw_status: 'running',
    supported_actions: ['cancel'],
  };
  render(<AsyncTaskList processes={[flowTask]} onOpenFlow={openFlow} onOpenSubagent={openChild} />);
  expect(screen.getByText('Field sites workflow')).toBeVisible();
  expect(screen.getByRole('img', { name: 'Flow: running' })).toBeVisible();
  await user.click(screen.getByRole('button', { name: 'Task details: Field sites workflow' }));
  await user.click(
    screen.getByRole('button', { name: 'Open the workflow run: Field sites workflow' }),
  );
  expect(openFlow).toHaveBeenCalledWith('task_workflow_handle', 'Workflow run');
  // Its conversation stays one click away.
  expect(
    screen.getByRole('button', { name: 'Open child conversation Field sites workflow' }),
  ).toBeVisible();
  expect(asyncProcessDetail(flowTask)).toBe('Workflow run');
});

it('hides a stale resume affordance while running and keeps restart behind More and confirmation', async () => {
  const control = vi.fn(async () => undefined);
  render(
    <AsyncTaskList
      processes={[
        {
          ...task,
          live_state: 'running',
          effective_status: 'running',
          supported_actions: ['pause', 'resume', 'restart'],
        },
      ]}
      onControlTask={control}
    />,
  );
  expect(screen.queryByRole('button', { name: 'resume Subagent: Worker #1' })).toBeNull();
  expect(screen.getByRole('button', { name: 'pause Subagent: Worker #1' })).toBeVisible();
  expect(screen.queryByRole('button', { name: 'restart Subagent: Worker #1' })).toBeNull();
  await userEvent.click(screen.getByRole('button', { name: 'More actions for Worker #1' }));
  await userEvent.click(screen.getByRole('menuitem', { name: 'Restart subagent' }));
  expect(control).not.toHaveBeenCalled();
  expect(screen.getByRole('alertdialog')).toBeVisible();
  await userEvent.click(screen.getByRole('button', { name: 'Restart subagent' }));
  expect(control).toHaveBeenCalledWith(expect.objectContaining({ id: task.id }), 'restart');
});

it('distinguishes a flow from a subagent and links a no-op follow-up to the actual earlier attempt', async () => {
  const open = vi.fn();
  render(
    <AsyncTaskList
      processes={[
        {
          ...task,
          id: 'flow',
          handle: 'flow',
          title: 'Station follow-up',
          effective_status: 'completed',
          live_state: 'completed',
          flow: { id: 'deep-research', status: 'not_run', previous_handle: 'old' },
          supported_actions: ['restart'],
        },
        task,
      ]}
      onOpenFlow={open}
      onControlTask={vi.fn()}
    />,
  );
  expect(screen.getByText('Station follow-up')).toBeVisible();
  expect(screen.getByText('Flow: No new run')).toBeVisible();
  expect(document.querySelector('[data-work-kind="workflow"]')).toHaveAttribute(
    'data-work-status',
    'not_run',
  );
  expect(document.querySelector('[data-work-kind="agent"]')).not.toBeNull();
  const row = screen.getByText('Station follow-up').closest('button')!;
  await userEvent.click(row);
  await userEvent.click(screen.getByRole('button', { name: 'Open earlier flow attempt' }));
  expect(open).toHaveBeenCalledWith('old', 'Deep research run');
  await userEvent.click(
    row.parentElement!.querySelector('[aria-label="More actions for Station follow-up"]')!,
  );
  expect(screen.getByRole('menuitem', { name: 'Restart flow' })).toBeVisible();
});

it('says a running script state in words in the compact rail, with its progress', () => {
  const script: AsyncProcess = {
    ...task,
    id: 'watcher',
    handle: 'task_watcher',
    kind: 'mcp-task',
    task_kind: 'Code',
    title: 'printer-watch',
    child_session_id: undefined,
    effective_status: 'running',
    live_state: 'running',
    status: 'working',
    raw_status: 'working',
    progress: { message: '2 min 5 s, 40 calls, 35 MB' },
    supported_actions: ['observe', 'cancel'],
  };
  render(<AsyncTaskList processes={[script]} compact />);
  expect(screen.getByText(/^Script: Running/)).toBeVisible();
  expect(screen.getByText(/40 calls/)).toBeVisible();
});

it('opens the row a link asked Work to show, once', async () => {
  const script: AsyncProcess = {
    ...task,
    id: 'script',
    handle: 'task_script',
    kind: 'mcp-task',
    task_kind: 'Code',
    title: 'Printer watch',
    description: 'Poll the printer every 5 s',
    child_session_id: undefined,
    effective_status: 'running',
    live_state: 'running',
    status: 'working',
    raw_status: 'working',
    supported_actions: ['cancel'],
  };
  useWorkTaskFocus.setState({ handle: undefined });
  render(<AsyncTaskList processes={[script]} />);
  expect(screen.queryByRole('region', { name: 'Assignment: Printer watch' })).toBeNull();
  act(() => useWorkTaskFocus.getState().focus('task_script'));
  expect(await screen.findByRole('region', { name: 'Assignment: Printer watch' })).toBeVisible();
  expect(useWorkTaskFocus.getState().handle).toBeUndefined();
  // The reader can still close it; the request does not reopen it.
  await userEvent.click(screen.getByRole('button', { name: 'Task details: Printer watch' }));
  expect(screen.queryByRole('region', { name: 'Assignment: Printer watch' })).toBeNull();
});

it('opens Completed work when a link asks for a task that has finished', () => {
  const finished: AsyncProcess = {
    ...task,
    id: 'done-script',
    handle: 'task_done_script',
    kind: 'mcp-task',
    task_kind: 'Code',
    title: 'lister',
    description: 'List the folder six times',
    child_session_id: undefined,
    effective_status: 'completed',
    live_state: 'completed',
    status: 'completed',
    raw_status: 'completed',
    supported_actions: [],
  };
  const toggle = vi.fn();
  useWorkTaskFocus.setState({ handle: undefined });
  render(
    <AsyncTaskList
      processes={[]}
      pagination={{
        hasMore: false,
        pending: false,
        loadMore: async () => {},
        history: {
          visible: false,
          toggle,
          items: [finished],
          hasMore: false,
          pending: false,
          loadMore: async () => {},
          error: '',
        },
      }}
    />,
  );
  expect(toggle).not.toHaveBeenCalled();
  act(() => useWorkTaskFocus.getState().focus('task_done_script'));
  expect(toggle).toHaveBeenCalledTimes(1);
});
