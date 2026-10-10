import { act, cleanup, render, screen } from '@testing-library/react';
import { afterEach, expect, it, vi } from 'vitest';
const mocks = vi.hoisted(() => ({ invoke: vi.fn() }));
vi.mock('@tauri-apps/api/core', () => ({ invoke: mocks.invoke }));
import { LocalStartupProgress } from './local-startup-progress';

afterEach(() => {
  cleanup();
  vi.useRealTimers();
  mocks.invoke.mockReset();
});

it('shows the native package output and elapsed time while startup is pending', async () => {
  vi.useFakeTimers();
  mocks.invoke.mockResolvedValue(
    '=== backend boot log ===\nPreparing sandbox read/execute access: bundled_runtime...',
  );
  const view = render(
    <LocalStartupProgress active status={{ kind: 'starting', detail: 'installing_runtime' }} />,
  );
  await act(() => vi.advanceTimersByTimeAsync(2000));
  expect(screen.getByRole('status')).toHaveTextContent('Preparing the local runtime and packages');
  expect(screen.getByRole('status')).toHaveTextContent('2s');
  expect(screen.getByText('Startup details')).toBeInTheDocument();
  expect(screen.getAllByText(/Preparing sandbox read\/execute access/u)).toHaveLength(2);
  expect(mocks.invoke).toHaveBeenCalledWith('read_logs');
  view.unmount();
  expect(vi.getTimerCount()).toBe(0);
});

it('keeps the startup stage readable if the log is not available', async () => {
  mocks.invoke.mockRejectedValue(new Error('log unavailable'));
  render(<LocalStartupProgress active status={{ kind: 'ready' }} />);
  expect(screen.getByRole('status')).toHaveTextContent('Opening the workspace');
  expect(screen.queryByText('Startup details')).not.toBeInTheDocument();
});
