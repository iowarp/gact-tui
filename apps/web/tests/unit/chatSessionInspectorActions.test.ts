import { describe, expect, it, vi } from 'vitest';
import { createChatSessionInspectorActions } from '../../src/routes/chatSessionInspectorActions.js';

function makeActions(overrides: {
  activeId?: string;
  patchSessionTask?: ReturnType<typeof vi.fn>;
  sessionContextFrame?: ReturnType<typeof vi.fn>;
} = {}) {
  const failToast = vi.fn();
  const refetchTasks = vi.fn();
  const frameDetail = { id: 'frame1', status: 'completed' };
  const patchSessionTask = overrides.patchSessionTask ?? vi.fn().mockResolvedValue(undefined);
  const sessionContextFrame =
    overrides.sessionContextFrame ?? vi.fn().mockResolvedValue(frameDetail);
  const actions = createChatSessionInspectorActions({
    activeId: () => overrides.activeId ?? 's1',
    client: { patchSessionTask, sessionContextFrame },
    failToast,
    refetchTasks,
  });
  return {
    actions,
    patchSessionTask,
    sessionContextFrame,
    failToast,
    refetchTasks,
    frameDetail,
  };
}

describe('createChatSessionInspectorActions', () => {
  it('patches task status and refetches tasks', async () => {
    const h = makeActions();

    await h.actions.cycleTaskStatus('task1', 'done');

    expect(h.patchSessionTask).toHaveBeenCalledWith('task1', { status: 'done' });
    expect(h.refetchTasks).toHaveBeenCalledOnce();
  });

  it('reports task status failures with retry callback', async () => {
    const error = new Error('denied');
    const h = makeActions({ patchSessionTask: vi.fn().mockRejectedValue(error) });

    await h.actions.cycleTaskStatus('task1', 'done');

    expect(h.failToast).toHaveBeenCalledWith(
      'Could not update task',
      error,
      expect.any(Function),
    );
    expect(h.refetchTasks).not.toHaveBeenCalled();
  });

  it('loads frame detail for the active session', async () => {
    const h = makeActions();

    await expect(h.actions.loadFrameDetail('frame1')).resolves.toBe(h.frameDetail);

    expect(h.sessionContextFrame).toHaveBeenCalledWith('s1', 'frame1');
  });

  it('rejects frame detail requests without an active session', async () => {
    const h = makeActions({ activeId: '' });

    await expect(h.actions.loadFrameDetail('frame1')).rejects.toThrow('no active session');

    expect(h.sessionContextFrame).not.toHaveBeenCalled();
  });
});
