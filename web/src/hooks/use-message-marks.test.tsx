import type { Session } from '@clio/core/v3';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { act, cleanup, renderHook } from '@testing-library/react';
import type { ReactNode } from 'react';
import { afterEach, beforeEach, expect, it, vi } from 'vitest';
import { useLiveStore } from '@/store/live-store';
import { useMessageMarks } from './use-message-marks';

const mocks = vi.hoisted(() => ({ update: vi.fn(), error: vi.fn() }));
vi.mock('./use-repository', () => ({ useRepository: () => ({ updateSession: mocks.update }) }));
vi.mock('@/providers/connection-provider', () => ({
  useConnectionSettings: () => ({ settings: { endpoint: 'http://clio:8100' } }),
}));
vi.mock('sonner', () => ({ toast: { dismiss: vi.fn(), error: mocks.error } }));
const session: Session = {
  id: 'session',
  workspace_id: 'ws',
  title: 'Review',
  state: 'completed',
  created_at: '',
  updated_at: '2026-10-11T00:00:00Z',
  metadata: { message_marks: { first: true } },
  pinned: false,
  archived: false,
  mode: 'edit',
  edit_mode: 'diff',
  routing_mode: 'auto',
  approval_mode: 'ask',
};
const updated = {
  ...session,
  updated_at: '2026-10-11T00:00:01Z',
  metadata: { message_marks: { first: true, next: true } },
};
function wrapper({ children }: { children: ReactNode }) {
  return <QueryClientProvider client={new QueryClient()}>{children}</QueryClientProvider>;
}
beforeEach(() => {
  vi.clearAllMocks();
  useLiveStore.getState().replaceSnapshots({ sessions: { session } });
});
afterEach(cleanup);

it('sends only the changed ID and publishes the acknowledged session to the live store', async () => {
  mocks.update.mockResolvedValue(updated);
  const { result, rerender } = renderHook(({ value }) => useMessageMarks(value, 'ws'), {
    initialProps: { value: session },
    wrapper,
  });
  await act(() => result.current.onMarkMessage('next', true));
  expect(mocks.update).toHaveBeenCalledWith('session', { message_marks: { next: true } });
  expect(useLiveStore.getState().entities.sessions['session']).toEqual(updated);
  rerender({ value: updated });
  expect([...result.current.markedMessageIds]).toEqual(['first', 'next']);
});

it('reports a rejected save and keeps the saved marks unchanged', async () => {
  mocks.update.mockRejectedValue(new Error('Service unavailable'));
  const { result } = renderHook(() => useMessageMarks(session, 'ws'), { wrapper });
  await act(async () => {
    await expect(result.current.onMarkMessage('next', true)).rejects.toThrow('Service unavailable');
  });
  expect(mocks.error).toHaveBeenCalledWith('Could not save message mark', {
    description: 'Service unavailable',
  });
  expect([...result.current.markedMessageIds]).toEqual(['first']);
  expect(useLiveStore.getState().entities.sessions['session']).toEqual(session);
});

it('does not replace a newer cross-client update with an older acknowledgement', async () => {
  const newest = {
    ...updated,
    updated_at: '2026-10-11T00:00:02Z',
    metadata: { message_marks: { first: true, next: true, other: true } },
  };
  useLiveStore.getState().replaceSnapshots({ sessions: { session: newest } });
  mocks.update.mockResolvedValue(updated);
  const { result } = renderHook(() => useMessageMarks(session, 'ws'), { wrapper });
  await act(() => result.current.onMarkMessage('next', true));
  expect(useLiveStore.getState().entities.sessions['session']).toEqual(newest);
});
