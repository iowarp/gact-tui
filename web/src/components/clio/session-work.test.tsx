import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { cleanup, render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, beforeEach, expect, it, vi } from 'vitest';
import { SessionWorkSummary, SessionWorkView } from './session-work';

const { repository } = vi.hoisted(() => ({
  repository: { sessionWork: vi.fn(), scheduledTurns: vi.fn() },
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
  goals: [goal],
  loops: [],
  goal_next_cursor: null,
  loop_next_cursor: null,
  todos: [
    { content: 'Inspect evidence', status: 'in_progress' },
    { content: 'Write evidence', status: 'completed' },
  ],
};
beforeEach(() => {
  repository.sessionWork.mockReset().mockResolvedValue(snapshot);
  repository.scheduledTurns.mockReset().mockResolvedValue({ schedules: [], cron_timezone: 'UTC' });
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
  expect(screen.getByText('No schedules recorded.')).toBeVisible();
  expect(screen.queryByRole('checkbox')).not.toBeInTheDocument();
  const entry = screen.getByRole('button', { name: 'Open session Work' });
  expect(entry).toHaveTextContent('1/2 done');
  expect(entry).toHaveAttribute('type', 'button');
  await userEvent.setup().click(entry);
  expect(open).toHaveBeenCalledOnce();
});
it('keeps stopped separate from paused and pages retained history', async () => {
  repository.sessionWork
    .mockResolvedValueOnce({
      ...snapshot,
      goals: [{ ...goal, state: 'stopped' }],
      goal_next_cursor: 25,
    })
    .mockResolvedValueOnce({
      ...snapshot,
      cursor: 25,
      goals: [{ ...goal, id: 'old', title: 'Earlier goal', state: 'completed' }],
    });
  mount(<SessionWorkView sessionId="s" />);
  expect(await screen.findByText('stopped')).toBeVisible();
  expect(screen.queryByText('paused', { exact: true })).not.toBeInTheDocument();
  await userEvent.setup().click(screen.getByRole('button', { name: 'Older' }));
  expect(await screen.findByText('Earlier goal')).toBeVisible();
  expect(repository.sessionWork).toHaveBeenLastCalledWith('s', 25, expect.any(AbortSignal));
});
it('shows read failures instead of empty or completed state', async () => {
  repository.sessionWork.mockRejectedValue(new Error('Offline'));
  mount(<SessionWorkView sessionId="s" />);
  expect(await screen.findByRole('alert')).toHaveTextContent('Session work could not be loaded');
  expect(screen.queryByText('No todos recorded.')).not.toBeInTheDocument();
});
