import { cleanup, render, screen } from '@testing-library/react';
import { afterEach, expect, it, vi } from 'vitest';
import { GoalCheckFeedback } from './goal-check-feedback';

const state = vi.hoisted(() => ({ phase: 'judging', state: 'active' }));
vi.mock('./use-session-work', () => ({
  useSessionWork: () => ({
    data: { goal: { ...state, details: { judge_started_at: new Date().toISOString() } } },
  }),
}));
afterEach(cleanup);
it('shows checking feedback only while the goal judge owns the phase', () => {
  const view = render(<GoalCheckFeedback sessionId="test" />);
  expect(screen.getByRole('status')).toHaveTextContent('Checking goal completion');
  state.phase = 'working';
  view.rerender(<GoalCheckFeedback sessionId="test" />);
  expect(screen.queryByRole('status')).not.toBeInTheDocument();
  state.phase = 'judging';
  state.state = 'paused';
  view.rerender(<GoalCheckFeedback sessionId="test" />);
  expect(screen.queryByRole('status')).not.toBeInTheDocument();
});
