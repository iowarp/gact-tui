import { act, cleanup, render, screen } from '@testing-library/react';
import { afterEach, expect, it, vi } from 'vitest';
const mocks = vi.hoisted(() => ({ invoke: vi.fn() }));
vi.mock('@tauri-apps/api/core', () => ({ invoke: mocks.invoke }));
import { DesktopBoot } from './desktop-boot';

afterEach(() => {
  cleanup();
  vi.useRealTimers();
  mocks.invoke.mockReset();
});

function stepRow(name: string) {
  return screen.getAllByRole('listitem').find((row) => row.textContent?.startsWith(name))!;
}

it('times a first-use install under Preparing, not under the service start', async () => {
  vi.useFakeTimers();
  mocks.invoke.mockResolvedValue('');
  // The supervisor's order on a lite first run: it checks, tries the service once,
  // finds no runtime, the install runs, then it checks again and starts the service.
  const view = render(<DesktopBoot stage="checking_existing" />);
  await act(() => vi.advanceTimersByTimeAsync(5000));
  view.rerender(<DesktopBoot stage="starting_service" />);
  await act(() => vi.advanceTimersByTimeAsync(1000));
  view.rerender(
    <DesktopBoot
      stage="installing_runtime"
      install={{ phase: 'downloading', downloadedMb: 354, totalMb: 687, at: Date.now() }}
    />,
  );
  await act(() => vi.advanceTimersByTimeAsync(1000));
  const preparing = screen.getByRole('listitem', { current: 'step' });
  expect(preparing).toHaveTextContent('Preparing the local runtime and packages');
  expect(preparing).toHaveTextContent('Downloading the runtime: 354 of 687 MB');
  expect(stepRow('Starting the local service')).toHaveAttribute('data-state', 'todo');
  expect(stepRow('Starting the local service')).not.toHaveTextContent(/\ds/u);

  await act(() => vi.advanceTimersByTimeAsync(120_000));
  view.rerender(<DesktopBoot stage="checking_existing" />);
  await act(() => vi.advanceTimersByTimeAsync(2000));
  view.rerender(<DesktopBoot stage="starting_service" />);
  await act(() => vi.advanceTimersByTimeAsync(3000));
  expect(stepRow('Checking the local service')).toHaveTextContent('7s');
  expect(stepRow('Preparing the local runtime and packages')).toHaveTextContent('2m');
  const starting = screen.getByRole('listitem', { current: 'step' });
  expect(starting).toHaveTextContent('Starting the local service');
  expect(starting).toHaveTextContent('4s');
  expect(starting).not.toHaveTextContent('Downloading');

  view.rerender(<DesktopBoot stage="opening_workspace" />);
  await act(() => vi.advanceTimersByTimeAsync(1000));
  expect(stepRow('Preparing the local runtime and packages')).toHaveTextContent('2m');
  expect(stepRow('Starting the local service')).toHaveTextContent('4s');
  view.unmount();
});

it('says the runtime is unpacking once its download has gone quiet', async () => {
  vi.useFakeTimers();
  mocks.invoke.mockResolvedValue('');
  render(
    <DesktopBoot
      stage="installing_runtime"
      install={{ phase: 'downloading', downloadedMb: 608, totalMb: 687, at: Date.now() }}
    />,
  );
  expect(screen.getByRole('listitem', { current: 'step' })).toHaveTextContent('608 of 687 MB');
  await act(() => vi.advanceTimersByTimeAsync(13_000));
  expect(screen.getByRole('listitem', { current: 'step' })).toHaveTextContent(
    'Unpacking the runtime',
  );
});
