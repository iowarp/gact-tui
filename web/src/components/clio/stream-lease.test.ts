import { renderHook, waitFor } from '@testing-library/react';
import { afterEach, expect, it, vi } from 'vitest';
import { useStreamLease } from './table-query-rows';

const repository = vi.hoisted(() => ({
  watchStream: vi.fn<(...args: unknown[]) => Promise<unknown>>(async () => ({})),
}));
vi.mock('@/hooks/use-repository', () => ({ useRepository: () => repository }));

afterEach(() => {
  repository.watchStream.mockReset();
  repository.watchStream.mockImplementation(async () => ({}));
});

it('gives each view of a stream its own lease, so one closing leaves the other watching', async () => {
  const first = renderHook(() => useStreamLease('stream_p', 'sess_1'));
  const second = renderHook(() => useStreamLease('stream_p', 'sess_1'));
  await waitFor(() => expect(repository.watchStream).toHaveBeenCalledTimes(2));
  const leases = repository.watchStream.mock.calls.map((call) => call[4]);
  expect(new Set(leases).size).toBe(2);
  first.unmount();
  await waitFor(() => expect(repository.watchStream).toHaveBeenCalledTimes(3));
  const release = repository.watchStream.mock.calls.at(-1)!;
  expect(release.slice(0, 3)).toEqual(['stream_p', 'sess_1', true]);
  expect(release[4]).toBe(leases[0]);
  second.unmount();
});

it('sends a remounted view its release before its new lease, never after', async () => {
  // The first lease answers late: a remount's release and new lease must wait for it.
  let answer: (value: unknown) => void = () => undefined;
  repository.watchStream.mockImplementationOnce(
    () => new Promise((resolve) => (answer = resolve)),
  );
  const view = renderHook(({ stream }) => useStreamLease(stream, 'sess_1'), {
    initialProps: { stream: 'stream_p' },
  });
  // The view remounts on the same stream (the effect cleans up and runs again).
  view.rerender({ stream: 'stream_q' });
  view.rerender({ stream: 'stream_p' });
  await Promise.resolve();
  expect(repository.watchStream).toHaveBeenCalledTimes(1);
  answer({});
  await waitFor(() => expect(repository.watchStream).toHaveBeenCalledTimes(5));
  const order = repository.watchStream.mock.calls.map((call) => `${call[0]}:${call[2]}`);
  expect(order).toEqual([
    'stream_p:false',
    'stream_p:true',
    'stream_q:false',
    'stream_q:true',
    'stream_p:false',
  ]);
  view.unmount();
});
