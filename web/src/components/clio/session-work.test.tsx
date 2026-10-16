import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { cleanup, render, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, beforeEach, expect, it, vi } from 'vitest';
import { SessionWorkStatus, SessionWorkSummary, SessionWorkView } from './session-work';

const { repository } = vi.hoisted(() => ({
  repository: {
    sessionWork: vi.fn(),
    scheduledTurns: vi.fn(),
    deleteScheduledTurn: vi.fn(),
    controlSessionWork: vi.fn().mockResolvedValue(undefined),
    setScheduleEnabled: vi.fn().mockResolvedValue(undefined),
  },
}));
vi.mock('@/hooks/use-repository', () => ({ useRepository: () => repository }));
vi.mock('@/providers/connection-provider', () => ({
  useConnectionSettings: () => ({ settings: { endpoint: 'test' } }),
}));
afterEach(cleanup);
const goal = {
  id: 'goal1',
  title: 'Verify readable output',
  state: 'active',
  iterations: 2,
  reason: '',
  created_at: '2026-09-08T12:00:00Z',
  phase: 'working',
  details: { max_goal_iters: 0, max_wallclock_s: 0, max_tokens: 0 },
};
const snapshot = {
  cursor: 0,
  schedules: [],
  goal,
  loop: null,
  goals: [goal, { ...goal, id: 'goal-old', title: 'Earlier goal', state: 'completed' as const }],
  loops: [
    {
      ...goal,
      id: 'loop-old',
      title: 'Earlier loop',
      state: 'stopped' as const,
      reason: 'loop_user_stopped',
    },
  ],
  goal_next_cursor: null,
  loop_next_cursor: null,
  todos: [
    { content: 'Inspect evidence', status: 'in_progress' },
    { content: 'Write evidence', status: 'completed' },
  ],
  todo_history: [
    {
      id: 'todo-old',
      created_at: '2026-09-08T11:00:00Z',
      items: [{ content: 'Earlier checklist task', status: 'pending' as const }],
    },
  ],
  todo_history_next_cursor: null,
  schedule_history: [
    {
      id: 'schedule-old',
      question: 'Earlier scheduled turn',
      state: 'deleted' as const,
      created_at: '2026-09-08T10:00:00Z',
      ended_at: '2026-09-08T10:30:00Z',
      recurring: false,
      next_fire_at: '2026-09-08T10:30:00Z',
      timezone: 'UTC',
    },
  ],
  schedule_history_next_cursor: null,
};
beforeEach(() => {
  localStorage.clear();
  window.dispatchEvent(new StorageEvent('storage', { key: null }));
  repository.sessionWork.mockReset().mockResolvedValue(snapshot);
  repository.scheduledTurns.mockReset().mockResolvedValue({ schedules: [], cron_timezone: 'UTC' });
  repository.controlSessionWork.mockClear();
  repository.setScheduleEnabled.mockClear();
  repository.deleteScheduledTurn.mockReset().mockResolvedValue(undefined);
});
function mount(children: React.ReactNode) {
  return render(
    <QueryClientProvider
      client={new QueryClient({ defaultOptions: { queries: { retry: false, gcTime: 0 } } })}
    >
      {children}
    </QueryClientProvider>,
  );
}

it.each(['goal', 'loop', 'schedule'])(
  'keeps a parked %s accessible from the bottom work finder',
  async (kind) => {
    repository.sessionWork.mockResolvedValue({
      ...snapshot,
      todos: [],
      goal: kind === 'goal' ? { ...goal, phase: 'waiting' } : null,
      loop: kind === 'loop' ? { ...goal, kind: 'loop', title: 'Monitor simulation' } : null,
      schedules:
        kind === 'schedule' ? [{ id: 'future', question: 'Inspect results', enabled: true }] : [],
    });
    const open = vi.fn();
    mount(<SessionWorkStatus sessionId="s" onOpen={open} fallback="No active work" />);
    const entry = await screen.findByRole('button', { name: 'Open session Work' });
    expect(entry).toHaveTextContent(
      kind === 'goal'
        ? 'Goal waiting'
        : kind === 'loop'
          ? 'Loop active: Monitor simulation'
          : 'Scheduled work',
    );
    expect(screen.queryByText('No active work')).toBeNull();
    await userEvent.click(entry);
    expect(open).toHaveBeenCalledOnce();
  },
);

it('shows authoritative work and exposes a compact canvas entry without toggling tasks', async () => {
  const open = vi.fn();
  mount(
    <>
      <SessionWorkSummary sessionId="s" onOpen={open} />
      <SessionWorkView sessionId="s" />
    </>,
  );
  expect(await screen.findByText('Verify readable output')).toBeVisible();
  expect(screen.getByRole('img', { name: 'In progress' })).toBeVisible();
  expect(screen.getByText('No active schedules.')).toBeVisible();
  expect(screen.getAllByRole('button', { name: /Previous 1/ })).toHaveLength(4);
  expect(screen.queryByText('Earlier checklist task')).not.toBeInTheDocument();
  await userEvent.setup().click(screen.getByRole('button', { name: /Previous 1 todo lists/ }));
  expect(await screen.findByText('Earlier checklist task')).toBeVisible();
  expect(screen.queryByRole('checkbox')).not.toBeInTheDocument();
  const entry = screen.getByRole('button', { name: 'Open session Work' });
  expect(entry).toHaveTextContent('1/2 current');
  expect(entry).toHaveAttribute('type', 'button');
  await userEvent.setup().click(entry);
  expect(open).toHaveBeenCalledOnce();
});

it('omits a todos-only summary when the adjacent inventory owns the count', async () => {
  repository.sessionWork.mockResolvedValue({ ...snapshot, goal: null, loop: null });
  mount(<SessionWorkSummary sessionId="s" onOpen={vi.fn()} includeTodos={false} />);
  await waitFor(() => expect(repository.sessionWork).toHaveBeenCalled());
  expect(screen.queryByRole('button', { name: 'Open session Work' })).not.toBeInTheDocument();
});

it('keeps active work visible without repeating the adjacent todo count', async () => {
  mount(<SessionWorkSummary sessionId="s" onOpen={vi.fn()} includeTodos={false} />);
  expect(await screen.findByText('Goal active: Verify readable output')).toBeVisible();
  expect(screen.queryByText('1/2 current')).not.toBeInTheDocument();
});

it('distinguishes goal and todo semantics and sizes the footer control consistently', async () => {
  mount(<SessionWorkStatus sessionId="s" onOpen={vi.fn()} fallback="No active work" />);
  const entry = await screen.findByRole('button', { name: 'Open session Work' });
  expect(entry).toHaveAttribute('data-work-kind', 'goal');
  expect(entry).toHaveClass('h-6');
  expect(entry.querySelector('svg')).toHaveClass('size-3.5');
  expect(entry).toHaveTextContent('Goal active: Verify readable output');
  expect(entry).toHaveTextContent('Todos: 1/2 current');
});

it('does not call a completed goal active in the footer', async () => {
  repository.sessionWork.mockResolvedValue({ ...snapshot, goal: { ...goal, state: 'completed' } });
  mount(<SessionWorkStatus sessionId="s" onOpen={vi.fn()} fallback="No active work" />);
  expect(await screen.findByRole('button', { name: 'Open session Work' })).toHaveTextContent(
    'Goal completed: Verify readable output',
  );
});

it('makes every Work category independently collapsible and scrollable', async () => {
  mount(<SessionWorkView sessionId="s" />);

  expect(await screen.findByText('Verify readable output')).toBeVisible();
  expect(document.querySelectorAll('[data-slot="work-section-scroll"]')).toHaveLength(4);
  const todos = screen.getByRole('region', { name: 'Todos' });
  const todosTrigger = within(todos).getByRole('button', { name: 'Todos: 1/2 current' });
  expect(todosTrigger).toHaveAttribute('aria-expanded', 'true');
  await userEvent.setup().click(todosTrigger);
  expect(todosTrigger).toHaveAttribute('aria-expanded', 'false');
  expect(within(todos).queryByText('Inspect evidence')).not.toBeInTheDocument();
  expect(
    within(screen.getByRole('region', { name: 'Goals' })).getByText('Verify readable output'),
  ).toBeVisible();
});
it('keeps stopped separate from paused and pages retained history', async () => {
  repository.sessionWork
    .mockResolvedValueOnce({
      ...snapshot,
      goal: null,
      goals: [{ ...goal, state: 'stopped' }],
      goal_next_cursor: 25,
    })
    .mockResolvedValueOnce({
      ...snapshot,
      cursor: 25,
      goals: [{ ...goal, id: 'old', title: 'Earlier goal', state: 'completed' }],
    });
  mount(<SessionWorkView sessionId="s" />);
  await userEvent.setup().click(
    within(await screen.findByRole('region', { name: 'Goals' })).getByRole('button', {
      name: /Previous 1 goal records/,
    }),
  );
  expect(await screen.findByText('Stopped')).toBeVisible();
  expect(screen.queryByText('paused', { exact: true })).not.toBeInTheDocument();
  await userEvent.setup().click(screen.getByRole('button', { name: 'Older' }));
  await userEvent.setup().click(
    within(await screen.findByRole('region', { name: 'Goals' })).getByRole('button', {
      name: /Previous 1 goal records/,
    }),
  );
  expect(await screen.findByText('Earlier goal')).toBeVisible();
  expect(repository.sessionWork).toHaveBeenLastCalledWith('s', 25, expect.any(AbortSignal));
});
it('shows read failures instead of empty or completed state', async () => {
  repository.sessionWork.mockRejectedValue(new Error('Offline'));
  mount(<SessionWorkView sessionId="s" />);
  expect(await screen.findByRole('alert')).toHaveTextContent('Session work could not be loaded');
  expect(screen.queryByText('No todos recorded.')).not.toBeInTheDocument();
});

it('lets a user cancel an active schedule from Work', async () => {
  repository.scheduledTurns.mockResolvedValue({
    cron_timezone: 'UTC',
    schedules: [
      {
        id: 'schedule-1',
        session_id: 's',
        question: 'Prepare the weekly report',
        cron: '',
        run_at: '2026-09-12T14:00:00Z',
        recurring: false,
        next_fire_at: '2026-09-12T14:00:00Z',
        timezone: 'UTC',
        enabled: true,
        created_at: '2026-09-11T14:00:00Z',
        fire_count: 0,
        max_fires: 1,
        until: '',
        overlap_policy: 'queue',
        retry_count: 0,
        last_error: '',
        disabled_reason: '',
      },
    ],
  });
  mount(<SessionWorkView sessionId="s" />);

  expect(await screen.findByText('Prepare the weekly report')).toBeVisible();
  expect(screen.queryByText('schedule-1')).not.toBeInTheDocument();

  await userEvent
    .setup()
    .click(
      await screen.findByRole('button', { name: 'Cancel schedule: Prepare the weekly report' }),
    );
  await userEvent.setup().click(screen.getByRole('button', { name: 'Cancel schedule' }));
  expect(repository.deleteScheduledTurn).toHaveBeenCalledWith('schedule-1');
});

it('opens work details and sends identity-scoped stop, restart and delete actions', async () => {
  const user = userEvent.setup();
  mount(<SessionWorkView sessionId="s" />);
  const goals = within(await screen.findByRole('region', { name: 'Goals' }));
  await user.click(goals.getByText('Details'));
  expect(goals.getAllByText('Unlimited')).toHaveLength(3);
  await user.click(goals.getByRole('button', { name: 'Stop' }));
  expect(repository.controlSessionWork).toHaveBeenCalledWith('s', 'goal', 'goal1', 'stop');
  await user.click(goals.getByRole('button', { name: /Previous 1 goal records/ }));
  await user.click(goals.getByRole('button', { name: 'Restart' }));
  expect(repository.controlSessionWork).toHaveBeenCalledWith('s', 'goal', 'goal-old', 'restart');
  const deletes = goals.getAllByRole('button', { name: 'Cancel and delete' });
  await user.click(deletes[0]!);
  expect(repository.controlSessionWork).toHaveBeenCalledWith('s', 'goal', 'goal1', 'delete');
});

it('includes waiting goals and enabled schedules in the bottom finder', async () => {
  repository.sessionWork.mockResolvedValue({
    ...snapshot,
    goal: { ...goal, phase: 'waiting' },
    schedules: [{ id: 'sch', question: 'Watch the simulation', enabled: true }],
  });
  mount(<SessionWorkSummary sessionId="s" onOpen={vi.fn()} />);
  const entry = await screen.findByRole('button', { name: 'Open session Work' });
  expect(entry).toHaveTextContent(/waiting/i);
  expect(entry).toHaveTextContent(/1 schedule/i);
});
