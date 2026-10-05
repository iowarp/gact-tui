import { attentionProfileSchema, type ActionCardAction } from '@clio/core/v3';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { act, renderHook } from '@testing-library/react';
import { StrictMode, type ReactNode } from 'react';
import { beforeEach, expect, it, vi } from 'vitest';
import { readAttentionEvidence } from '@/lib/attention-evidence-navigation';
import { useActionCard } from './use-action-card';

const mocks = vi.hoisted(() => ({
  settings: { endpoint: 'http://clio:8100', token: 'first' },
  agentTask: vi.fn(),
  navigate: vi.fn(),
  open: vi.fn(),
}));
vi.mock('./use-repository', () => ({ useRepository: () => ({ agentTask: mocks.agentTask }) }));
vi.mock('react-router-dom', () => ({ useNavigate: () => mocks.navigate }));
vi.mock('@/providers/connection-provider', () => ({
  useConnectionSettings: () => ({ settings: mocks.settings }),
}));
const task = {
  task_id: 'reviewer',
  parent_session_id: 'parent',
  child_session_id: 'child',
  expert_id: 'spotter_watcher',
  run_index: 0,
  status: 'running',
};
const inspection = {
  schema_version: 1,
  selections: [
    {
      session_id: 'parent',
      message_id: 'm',
      part_id: 'p',
      field: 'thought',
      content_revision: 'revision',
      selection: { kind: 'text', start: 0, end: 8 },
    },
  ],
  direction: 'generated_to_source',
  profile: attentionProfileSchema.parse({}),
  profile_revision: 'profile-hash',
  capture_sha256: 'capture-hash',
  lm_call_id: 'call',
};
const action: ActionCardAction = {
  id: 'inspect_evidence',
  label: 'Inspect evidence',
  enabled: true,
  behavior: { kind: 'inspect_attention', handle_id: 'reviewer', inspection },
};
function wrapper({ children }: { children: ReactNode }) {
  return (
    <StrictMode>
      <QueryClientProvider client={new QueryClient()}>{children}</QueryClientProvider>
    </StrictMode>
  );
}
beforeEach(() => {
  vi.clearAllMocks();
  mocks.settings.token = 'first';
  mocks.agentTask.mockResolvedValue(task);
});

it('opens the existing reviewer beside the exact parent inspection', async () => {
  const { result } = renderHook(() => useActionCard('parent', 'ws', mocks.open), { wrapper });
  await act(() => result.current.mutateAsync(action));
  expect(mocks.open).toHaveBeenCalledWith(
    expect.objectContaining({ child_session_id: 'child' }),
    'canvas',
  );
  expect(readAttentionEvidence(window.location.hash, 'parent')).toMatchObject(inspection);
  expect(mocks.navigate).not.toHaveBeenCalled();
});
it('Discuss opens the side panel without replacing the main conversation', async () => {
  const { result } = renderHook(() => useActionCard('parent', 'ws', mocks.open), { wrapper });
  await act(() =>
    result.current.mutateAsync({
      ...action,
      behavior: { kind: 'focus_session', handle_id: 'reviewer' },
    }),
  );
  expect(mocks.open).toHaveBeenCalled();
  expect(mocks.navigate).not.toHaveBeenCalled();
});
it('refuses another parent and malformed or cross-session evidence', async () => {
  const { result } = renderHook(() => useActionCard('parent', 'ws', mocks.open), { wrapper });
  mocks.agentTask.mockResolvedValue({ ...task, parent_session_id: 'other' });
  await act(async () => {
    await expect(result.current.mutateAsync(action)).rejects.toThrow('does not belong');
  });
  for (const bad of [
    {},
    { ...inspection, selections: [{ ...inspection.selections[0], session_id: 'other' }] },
  ]) {
    await act(async () => {
      await expect(
        result.current.mutateAsync({
          ...action,
          behavior: { ...action.behavior, inspection: bad },
        }),
      ).rejects.toThrow();
    });
  }
  expect(mocks.open).not.toHaveBeenCalled();
  expect(mocks.navigate).not.toHaveBeenCalled();
});
it('does not open a stale task after credentials change on the same endpoint', async () => {
  let resolve!: (value: typeof task) => void;
  mocks.agentTask.mockReturnValue(
    new Promise((done) => {
      resolve = done;
    }),
  );
  const { result, rerender } = renderHook(() => useActionCard('parent', 'ws', mocks.open), {
    wrapper,
  });
  let pending!: Promise<unknown>;
  act(() => {
    pending = result.current.mutateAsync(action);
  });
  await act(async () => {
    await Promise.resolve();
  });
  mocks.settings.token = 'second';
  rerender();
  await act(async () => {
    resolve(task);
    await expect(pending).rejects.toThrow('changed');
  });
  expect(mocks.open).not.toHaveBeenCalled();
  expect(mocks.navigate).not.toHaveBeenCalled();
});
it('refuses disabled and unknown behavior without querying a task', async () => {
  const { result } = renderHook(() => useActionCard('parent', 'ws', mocks.open), { wrapper });
  for (const item of [
    { ...action, enabled: false },
    { ...action, behavior: { kind: 'future', handle_id: 'reviewer' } },
  ]) {
    await act(async () => {
      await expect(result.current.mutateAsync(item)).rejects.toThrow('not available');
    });
  }
  expect(mocks.agentTask).not.toHaveBeenCalled();
});
