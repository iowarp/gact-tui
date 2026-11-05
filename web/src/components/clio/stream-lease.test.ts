import { renderHook } from '@testing-library/react';
import { afterEach, expect, it, vi } from 'vitest';
import { useStreamLease } from './table-query-rows';

const repository = vi.hoisted(() => ({ watchStream: vi.fn(async () => ({})) }));
vi.mock('@/hooks/use-repository', () => ({ useRepository: () => repository }));

afterEach(() => repository.watchStream.mockClear());

it('gives each view of a stream its own lease, so one closing leaves the other watching', () => {
  const first = renderHook(() => useStreamLease('stream_p', 'sess_1'));
  const second = renderHook(() => useStreamLease('stream_p', 'sess_1'));
  const holds = repository.watchStream.mock.calls.map((call) => call as unknown[]);
  const leases = holds.map((call) => call[4]);
  expect(leases).toHaveLength(2);
  expect(new Set(leases).size).toBe(2);
  first.unmount();
  const release = repository.watchStream.mock.calls.at(-1) as unknown[];
  expect(release.slice(0, 3)).toEqual(['stream_p', 'sess_1', true]);
  expect(release[4]).toBe(leases[0]);
  second.unmount();
});
