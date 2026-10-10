import type { ToolInvocation } from '@clio/core/v3';
import { act, cleanup, fireEvent, render, screen } from '@testing-library/react';
import { afterEach, expect, it, vi } from 'vitest';
import { ClioToolInvocation } from './tool-invocation';
import { toolDuration } from './use-tool-duration';

const call: ToolInvocation = {
  id: 'environment',
  session_id: 'session',
  name: 'prepare_execution_runtime',
  title: 'Get execution environment',
  state: 'succeeded',
  duration_ms: 12_540,
};

afterEach(() => {
  cleanup();
  vi.useRealTimers();
});

it.each(['succeeded', 'failed', 'cancelled'] as const)(
  'keeps execution time visible on a compact %s row and in details',
  (state) => {
    render(<ClioToolInvocation compact tool={{ ...call, state }} />);
    const row = screen.getByRole('button', {
      name: 'Show result for Get execution environment',
    });
    expect(row).toHaveTextContent('12.5 s');
    fireEvent.click(
      screen.getByRole('button', { name: 'Technical details for Get execution environment' }),
    );
    expect(screen.getByText('Execution time: 12.5 s')).toBeVisible();
  },
);

it('updates a running call and freezes at the recorded duration without keeping a timer', () => {
  vi.useFakeTimers();
  vi.setSystemTime(new Date('2026-10-09T12:00:03Z'));
  const running = {
    ...call,
    state: 'running' as const,
    duration_ms: undefined,
    started_at: '2026-10-09T12:00:00Z',
  };
  const view = render(<ClioToolInvocation compact tool={running} />);
  expect(screen.getByTitle('Elapsed time; updates while running')).toHaveTextContent('3 s');
  act(() => vi.advanceTimersByTime(2_000));
  expect(screen.getByTitle('Elapsed time; updates while running')).toHaveTextContent('5 s');
  view.rerender(
    <ClioToolInvocation compact tool={{ ...running, state: 'succeeded', duration_ms: 4_840 }} />,
  );
  expect(screen.getByTitle('Execution time')).toHaveTextContent('4.8 s');
  expect(vi.getTimerCount()).toBe(0);
  act(() => vi.advanceTimersByTime(10_000));
  expect(screen.getByTitle('Execution time')).toHaveTextContent('4.8 s');
});

it('uses timestamps after reload and preserves a real zero duration', () => {
  const timestamps = {
    ...call,
    duration_ms: undefined,
    started_at: '2026-10-09T12:00:00Z',
    completed_at: '2026-10-09T12:01:45Z',
  };
  render(<ClioToolInvocation compact tool={timestamps} />);
  expect(screen.getByTitle('Execution time')).toHaveTextContent('1 min 45 s');
  expect(toolDuration({ ...timestamps, duration_ms: 0 }, Date.now())).toBe(0);
});

it('does not invent timing or start an interval for a pending or untimed call', () => {
  vi.useFakeTimers();
  const view = render(
    <ClioToolInvocation compact tool={{ ...call, state: 'pending', duration_ms: undefined }} />,
  );
  expect(view.container.querySelector('[data-slot="tool-duration"]')).toBeNull();
  expect(vi.getTimerCount()).toBe(0);
  view.unmount();
  expect(vi.getTimerCount()).toBe(0);
});

it.each([NaN, Infinity, -1])('ignores invalid recorded duration %s', (duration_ms) => {
  expect(toolDuration({ ...call, duration_ms }, Date.now())).toBeUndefined();
});

it('removes the running timer when its row unmounts', () => {
  vi.useFakeTimers();
  const view = render(
    <ClioToolInvocation
      compact
      tool={{
        ...call,
        state: 'running',
        started_at: new Date().toISOString(),
        duration_ms: undefined,
      }}
    />,
  );
  expect(vi.getTimerCount()).toBe(1);
  view.unmount();
  expect(vi.getTimerCount()).toBe(0);
});
