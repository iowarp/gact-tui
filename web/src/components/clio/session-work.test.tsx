import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { cleanup, render, screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, beforeEach, expect, it, vi } from 'vitest';
import { SessionWorkSummary, SessionWorkView } from './session-work';

const { repository } = vi.hoisted(() => ({
  repository: {
    sessionWork: vi.fn(),
    scheduledTurns: vi.fn(),
    deleteScheduledTurn: vi.fn(),
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
};
const snapshot = {
  cursor: 0,
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
  repository.sessionWork.mockReset().mockResolvedValue(snapshot);
  repository.scheduledTurns.mockReset().mockResolvedValue({ schedules: [], cron_timezone: 'UTC' });
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
  await userEvent.setup().click(screen.getByRole('button', { name: /Previous 1 task lists/ }));
  expect(await screen.findByText('Earlier checklist task')).toBeVisible();
  expect(screen.queryByRole('checkbox')).not.toBeInTheDocument();
  const entry = screen.getByRole('button', { name: 'Open session Work' });
  expect(entry).toHaveTextContent('1/2 done');
  expect(entry).toHaveAttribute('type', 'button');
  await userEvent.setup().click(entry);
  expect(open).toHaveBeenCalledOnce();
});

it('makes every Work category independently collapsible and scrollable', async () => {
  mount(<SessionWorkView sessionId="s" />);

  expect(await screen.findByText('Verify readable output')).toBeVisible();
  expect(document.querySelectorAll('[data-slot="work-section-scroll"]')).toHaveLength(4);
  const todos = screen.getByRole('region', { name: 'Todos' });
  const todosTrigger = within(todos).getByRole('button', { name: 'Todos: 2 current' });
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
